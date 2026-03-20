import type { D1Database, KVNamespace, Queue as CfQueue } from '@cloudflare/workers-types';
import type { QueueMessage, Lead } from '../types/env';
import { queryOne, execute, newId, timestamp } from '../utils/db';
import { sendFollowUpEmail } from './email';

// Queue job status
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Queue job record
interface QueueJob {
  id: string;
  team_id: string;
  job_type: string;
  payload: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
}

// Enqueue a job
export async function enqueueJob(
  queue: CfQueue<QueueMessage>,
  message: Omit<QueueMessage, 'timestamp'>
): Promise<void> {
  const queueMessage: QueueMessage = {
    ...message,
    timestamp: new Date().toISOString(),
  };

  await queue.send(queueMessage);
}

// Enqueue batch of jobs
export async function enqueueBatch(
  queue: CfQueue<QueueMessage>,
  messages: Array<Omit<QueueMessage, 'timestamp'>>
): Promise<void> {
  const queueMessages: QueueMessage[] = messages.map((msg) => ({
    ...msg,
    timestamp: new Date().toISOString(),
  }));

  await queue.sendBatch(queueMessages);
}

// Create job record in database (for tracking/recovery)
export async function createJobRecord(
  db: D1Database,
  data: {
    teamId: string;
    jobType: QueueMessage['type'];
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const id = newId();
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO queue_jobs (id, team_id, job_type, payload, status, attempts, max_attempts, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 3, ?)`,
    [id, data.teamId, data.jobType, JSON.stringify(data.payload), now]
  );

  return id;
}

// Update job status
export async function updateJobStatus(
  db: D1Database,
  jobId: string,
  status: JobStatus,
  errorMessage?: string
): Promise<void> {
  const now = timestamp();
  const updates: string[] = ['status = ?', 'processed_at = ?'];
  const params: unknown[] = [status, now];

  if (status === 'completed') {
    updates.push('completed_at = ?');
    params.push(now);
  }

  if (errorMessage) {
    updates.push('error_message = ?');
    params.push(errorMessage);
  }

  params.push(jobId);

  await execute(
    db,
    `UPDATE queue_jobs SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

// Increment job attempts
export async function incrementJobAttempts(
  db: D1Database,
  jobId: string
): Promise<number> {
  const now = timestamp();
  const job = await queryOne<QueueJob>(
    db,
    `SELECT * FROM queue_jobs WHERE id = ?`,
    [jobId]
  );

  if (!job) return 0;

  const newAttempts = job.attempts + 1;
  await execute(
    db,
    `UPDATE queue_jobs SET attempts = ?, processed_at = ? WHERE id = ?`,
    [newAttempts, now, jobId]
  );

  return newAttempts;
}

// Process follow-up job
export async function processFollowUpJob(
  db: D1Database,
  kv: KVNamespace,
  apiKey: string,
  teamId: string,
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  // Get lead
  const lead = await queryOne<Lead>(
    db,
    `SELECT * FROM leads WHERE id = ? AND team_id = ?`,
    [leadId, teamId]
  );

  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }

  if (!lead.email) {
    return { success: false, error: 'Lead has no email address' };
  }

  // Get team/user info for sender
  const team = await queryOne<{ name: string }>(
    db,
    `SELECT name FROM teams WHERE id = ?`,
    [teamId]
  );

  const senderName = team?.name || 'LeadFlow AI';
  const senderEmail = 'noreply@leadflow.ai';

  // Send follow-up email
  const result = await sendFollowUpEmail(
    db,
    kv,
    apiKey,
    lead,
    senderName,
    senderEmail
  );

  // Create activity for email sent
  if (result.success) {
    await execute(
      db,
      `INSERT INTO activities (id, lead_id, team_id, user_id, type, description, metadata, created_at)
       VALUES (?, ?, ?, NULL, 'email_sent', ?, ?, ?)`,
      [
        newId(),
        leadId,
        teamId,
        `Follow-up email sent to ${lead.email}`,
        JSON.stringify({ email: lead.email }),
        timestamp(),
      ]
    );

    // Update last contacted
    await execute(
      db,
      `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
      [timestamp(), timestamp(), leadId, teamId]
    );
  }

  return result;
}

// Process export job (placeholder for Phase 7)
export async function processExportJob(
  db: D1Database,
  teamId: string,
  _payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string; url?: string }> {
  // Will be implemented in Phase 7
  console.log(`Processing export for team ${teamId}`);
  return { success: true };
}

// Get failed jobs for retry
export async function getFailedJobs(
  db: D1Database,
  teamId?: string,
  limit: number = 10
): Promise<QueueJob[]> {
  let query = `SELECT * FROM queue_jobs WHERE status = 'failed' AND attempts < max_attempts`;
  const params: unknown[] = [];

  if (teamId) {
    query += ` AND team_id = ?`;
    params.push(teamId);
  }

  query += ` ORDER BY created_at ASC LIMIT ?`;
  params.push(limit);

  const results = await db.prepare(query).bind(...params).all<QueueJob>();
  return results.results;
}

// Retry failed job
export async function retryFailedJob(
  queue: CfQueue<QueueMessage>,
  db: D1Database,
  jobId: string
): Promise<boolean> {
  const job = await queryOne<QueueJob>(
    db,
    `SELECT * FROM queue_jobs WHERE id = ?`,
    [jobId]
  );

  if (!job || job.status !== 'failed' || job.attempts >= job.max_attempts) {
    return false;
  }

  // Reset status
  await execute(
    db,
    `UPDATE queue_jobs SET status = 'pending', error_message = NULL WHERE id = ?`,
    [jobId]
  );

  // Re-queue
  const payload = JSON.parse(job.payload) as Record<string, unknown>;
  await enqueueJob(queue, {
    type: job.job_type as QueueMessage['type'],
    teamId: job.team_id,
    leadId: payload.leadId as string | undefined,
    payload,
  });

  return true;
}
