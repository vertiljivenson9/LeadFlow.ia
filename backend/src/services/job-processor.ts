/**
 * Job Processor Service - FREE alternative to Cloudflare Queues
 * 
 * Uses:
 * - D1 table `queue_jobs` to store pending jobs
 * - Cloudflare Cron Triggers (FREE!) to process jobs every 5 minutes
 * 
 * No paid plan required!
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Lead } from '../types/env';
import { queryOne, execute, newId, timestamp } from '../utils/db';
import { sendEmail, getEmailTemplate, renderTemplate, createEmailLog, updateEmailLogStatus } from './email';
import { calculateLeadScore } from './lead';

// Job types
export type JobType = 'send_follow_up' | 'send_email' | 'score_update' | 'export';

// Job status
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ================================================
// CREATE JOB - Call this when you need to schedule work
// ================================================
export async function createJob(
  db: D1Database,
  data: {
    teamId: string;
    jobType: JobType;
    leadId?: string;
    payload?: Record<string, unknown>;
  }
): Promise<string> {
  const id = newId();
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO queue_jobs (id, team_id, job_type, payload, status, attempts, max_attempts, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 3, ?)`,
    [
      id,
      data.teamId,
      data.jobType,
      JSON.stringify({
        leadId: data.leadId,
        ...(data.payload || {}),
      }),
      now,
    ]
  );

  console.log(`Job created: ${data.jobType} for team ${data.teamId}`);
  return id;
}

// ================================================
// GET PENDING JOBS - Called by Cron
// ================================================
export async function getPendingJobs(
  db: D1Database,
  limit: number = 20
): Promise<Array<{
  id: string;
  team_id: string;
  job_type: string;
  payload: string;
  attempts: number;
  max_attempts: number;
}>> {
  const results = await db.prepare(
    `SELECT id, team_id, job_type, payload, attempts, max_attempts 
     FROM queue_jobs 
     WHERE status = 'pending' AND attempts < max_attempts
     ORDER BY created_at ASC
     LIMIT ?`
  ).bind(limit).all();

  return results.results as Array<{
    id: string;
    team_id: string;
    job_type: string;
    payload: string;
    attempts: number;
    max_attempts: number;
  }>;
}

// ================================================
// MARK JOB STATUS
// ================================================
export async function markJobProcessing(db: D1Database, jobId: string): Promise<void> {
  await execute(
    db,
    `UPDATE queue_jobs SET status = 'processing', processed_at = ? WHERE id = ?`,
    [timestamp(), jobId]
  );
}

export async function markJobCompleted(db: D1Database, jobId: string): Promise<void> {
  await execute(
    db,
    `UPDATE queue_jobs SET status = 'completed', completed_at = ? WHERE id = ?`,
    [timestamp(), jobId]
  );
}

export async function markJobFailed(
  db: D1Database,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const now = timestamp();
  await execute(
    db,
    `UPDATE queue_jobs SET status = 'failed', error_message = ?, attempts = attempts + 1, processed_at = ? WHERE id = ?`,
    [errorMessage, now, jobId]
  );
}

// Reset failed jobs for retry
export async function resetFailedJobs(db: D1Database): Promise<number> {
  const result = await execute(
    db,
    `UPDATE queue_jobs SET status = 'pending' WHERE status = 'failed' AND attempts < max_attempts`
  );
  return result.changes;
}

// ================================================
// PROCESS SINGLE JOB
// ================================================
async function processJob(
  db: D1Database,
  kv: KVNamespace,
  resendApiKey: string,
  job: {
    id: string;
    team_id: string;
    job_type: string;
    payload: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const payload = JSON.parse(job.payload) as Record<string, unknown>;
  const leadId = payload.leadId as string | undefined;

  switch (job.job_type) {
    // ================================================
    // SEND FOLLOW-UP EMAIL
    // ================================================
    case 'send_follow_up': {
      if (!leadId) {
        return { success: false, error: 'Lead ID is required' };
      }

      // Get lead
      const lead = await queryOne<Lead>(
        db,
        `SELECT * FROM leads WHERE id = ? AND team_id = ?`,
        [leadId, job.team_id]
      );

      if (!lead) {
        return { success: false, error: 'Lead not found' };
      }

      if (!lead.email) {
        return { success: false, error: 'Lead has no email address' };
      }

      // Get team
      const team = await queryOne<{ name: string }>(
        db,
        `SELECT name FROM teams WHERE id = ?`,
        [job.team_id]
      );

      // Get email template
      const template = await getEmailTemplate(db, job.team_id);

      if (!template) {
        return { success: false, error: 'No email template found' };
      }

      // Render email
      const subject = renderTemplate(template.subject, {
        lead_name: lead.name,
        sender_name: team?.name || 'LeadFlow AI',
        company: lead.company || '',
      });

      const html = renderTemplate(template.body, {
        lead_name: lead.name,
        sender_name: team?.name || 'LeadFlow AI',
        company: lead.company || '',
      });

      // Create email log
      const log = await createEmailLog(db, {
        teamId: job.team_id,
        leadId: lead.id,
        templateId: template.id,
        recipientEmail: lead.email,
        subject,
        status: 'pending',
      });

      // Send email
      const result = await sendEmail(resendApiKey, {
        from: `${team?.name || 'LeadFlow AI'} <noreply@leadflow.ai>`,
        to: lead.email,
        subject,
        html,
        text: html.replace(/<[^>]*>/g, ''),
      });

      // Update email log
      await updateEmailLogStatus(
        db,
        log.id,
        result.success ? 'sent' : 'failed',
        result.id,
        result.error
      );

      if (result.success) {
        // Update last_contacted_at
        await execute(
          db,
          `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`,
          [timestamp(), timestamp(), leadId]
        );

        // Create activity
        await execute(
          db,
          `INSERT INTO activities (id, lead_id, team_id, user_id, type, description, metadata, created_at)
           VALUES (?, ?, ?, NULL, 'email_sent', ?, ?, ?)`,
          [
            newId(),
            leadId,
            job.team_id,
            `Follow-up email sent to ${lead.email}`,
            JSON.stringify({ email: lead.email }),
            timestamp(),
          ]
        );
      }

      return { success: result.success, error: result.error };
    }

    // ================================================
    // SEND GENERIC EMAIL
    // ================================================
    case 'send_email': {
      const to = payload.to as string;
      const subject = payload.subject as string;
      const html = payload.html as string;

      if (!to || !subject || !html) {
        return { success: false, error: 'Missing email parameters' };
      }

      const result = await sendEmail(resendApiKey, {
        from: 'LeadFlow AI <noreply@leadflow.ai>',
        to,
        subject,
        html,
      });

      return { success: result.success, error: result.error };
    }

    // ================================================
    // UPDATE LEAD SCORE
    // ================================================
    case 'score_update': {
      if (!leadId) {
        return { success: false, error: 'Lead ID is required' };
      }

      const lead = await queryOne<{
        id: string;
        team_id: string;
        source: string;
        created_at: string;
      }>(
        db,
        `SELECT id, team_id, source, created_at FROM leads WHERE id = ? AND team_id = ?`,
        [leadId, job.team_id]
      );

      if (!lead) {
        return { success: false, error: 'Lead not found' };
      }

      // Get activity count
      const activityResult = await db.prepare(
        `SELECT COUNT(*) as count FROM activities WHERE lead_id = ?`
      ).bind(leadId).first<{ count: number }>();

      const activityCount = activityResult?.count || 0;

      // Calculate new score
      const newScore = calculateLeadScore(
        lead.source as 'website' | 'referral' | 'social' | 'email' | 'phone' | 'event' | 'manual' | 'other',
        lead.created_at,
        activityCount
      );

      // Update score
      await execute(
        db,
        `UPDATE leads SET score = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
        [newScore, timestamp(), leadId, job.team_id]
      );

      return { success: true };
    }

    default:
      return { success: false, error: `Unknown job type: ${job.job_type}` };
  }
}

// ================================================
// PROCESS ALL PENDING JOBS - Called by Cron
// ================================================
export async function processPendingJobs(
  db: D1Database,
  kv: KVNamespace,
  resendApiKey: string,
  batchSize: number = 20
): Promise<{ processed: number; succeeded: number; failed: number }> {
  console.log('Processing pending jobs...');

  const jobs = await getPendingJobs(db, batchSize);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(`Found ${jobs.length} pending jobs`);

  for (const job of jobs) {
    processed++;
    await markJobProcessing(db, job.id);

    try {
      const result = await processJob(db, kv, resendApiKey, job);

      if (result.success) {
        await markJobCompleted(db, job.id);
        succeeded++;
        console.log(`Job ${job.id} (${job.job_type}) completed`);
      } else {
        await markJobFailed(db, job.id, result.error || 'Unknown error');
        failed++;
        console.error(`Job ${job.id} (${job.job_type}) failed: ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markJobFailed(db, job.id, errorMessage);
      failed++;
      console.error(`Job ${job.id} (${job.job_type}) error: ${errorMessage}`);
    }
  }

  console.log(`Jobs processed: ${processed}, succeeded: ${succeeded}, failed: ${failed}`);
  return { processed, succeeded, failed };
}

// ================================================
// CLEANUP OLD JOBS
// ================================================
export async function cleanupOldJobs(
  db: D1Database,
  daysOld: number = 7
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  const result = await execute(
    db,
    `DELETE FROM queue_jobs WHERE status IN ('completed', 'failed') AND created_at < ?`,
    [cutoffDate]
  );

  console.log(`Cleaned up ${result.changes} old jobs`);
  return result.changes;
}
