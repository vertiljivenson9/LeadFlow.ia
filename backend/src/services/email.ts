import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Lead, EmailTemplate, EmailLog } from '../types/env';
import { queryOne, execute, newId, timestamp } from '../utils/db';

// Resend API response types
interface ResendResponse {
  id: string;
  from: string;
  to: string[];
  created_at: string;
}

interface ResendError {
  name: string;
  message: string;
}

// Send email via Resend API
export async function sendEmail(
  apiKey: string,
  options: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await response.json() as ResendResponse | ResendError;

    if (!response.ok) {
      const error = data as ResendError;
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }

    const result = data as ResendResponse;
    return {
      success: true,
      id: result.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get email template
export async function getEmailTemplate(
  db: D1Database,
  teamId: string,
  templateId?: string
): Promise<EmailTemplate | null> {
  if (templateId) {
    return queryOne<EmailTemplate>(
      db,
      `SELECT * FROM email_templates WHERE id = ? AND team_id = ?`,
      [templateId, teamId]
    );
  }

  // Get default template for team
  const teamTemplate = await queryOne<EmailTemplate>(
    db,
    `SELECT * FROM email_templates WHERE team_id = ? AND is_default = 1`,
    [teamId]
  );

  if (teamTemplate) return teamTemplate;

  // Fall back to system default
  return queryOne<EmailTemplate>(
    db,
    `SELECT * FROM email_templates WHERE id = 'default-follow-up'`
  );
}

// Render template with variables
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

// Create email log
export async function createEmailLog(
  db: D1Database,
  data: {
    teamId: string;
    leadId?: string;
    templateId?: string;
    recipientEmail: string;
    subject: string;
    status: 'pending' | 'sent' | 'failed';
    errorMessage?: string;
    externalId?: string;
  }
): Promise<EmailLog> {
  const id = newId();
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO email_logs (id, team_id, lead_id, template_id, recipient_email, subject, status, error_message, external_id, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.teamId,
      data.leadId || null,
      data.templateId || null,
      data.recipientEmail,
      data.subject,
      data.status,
      data.errorMessage || null,
      data.externalId || null,
      now,
      data.status === 'sent' ? now : null,
    ]
  );

  return {
    id,
    team_id: data.teamId,
    lead_id: data.leadId || null,
    template_id: data.templateId || null,
    recipient_email: data.recipientEmail,
    subject: data.subject,
    status: data.status,
    error_message: data.errorMessage || null,
    external_id: data.externalId || null,
    created_at: now,
    sent_at: data.status === 'sent' ? now : null,
  };
}

// Update email log status
export async function updateEmailLogStatus(
  db: D1Database,
  logId: string,
  status: 'sent' | 'failed',
  externalId?: string,
  errorMessage?: string
): Promise<void> {
  const now = timestamp();
  await execute(
    db,
    `UPDATE email_logs SET status = ?, external_id = ?, error_message = ?, sent_at = ? WHERE id = ?`,
    [status, externalId || null, errorMessage || null, status === 'sent' ? now : null, logId]
  );
}

// Send follow-up email for lead
export async function sendFollowUpEmail(
  db: D1Database,
  kv: KVNamespace,
  apiKey: string,
  lead: Lead,
  senderName: string,
  senderEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (!lead.email) {
    return { success: false, error: 'Lead has no email address' };
  }

  // Get template
  const template = await getEmailTemplate(db, lead.team_id);

  if (!template) {
    return { success: false, error: 'No email template found' };
  }

  // Render subject and body
  const subject = renderTemplate(template.subject, {
    lead_name: lead.name,
    sender_name: senderName,
    company: lead.company || '',
  });

  const html = renderTemplate(template.body, {
    lead_name: lead.name,
    sender_name: senderName,
    company: lead.company || '',
  });

  // Create pending log
  const log = await createEmailLog(db, {
    teamId: lead.team_id,
    leadId: lead.id,
    templateId: template.id,
    recipientEmail: lead.email,
    subject,
    status: 'pending',
  });

  // Send email
  const result = await sendEmail(apiKey, {
    from: `${senderName} <${senderEmail}>`,
    to: lead.email,
    subject,
    html,
    text: html.replace(/<[^>]*>/g, ''),
  });

  // Update log
  await updateEmailLogStatus(
    db,
    log.id,
    result.success ? 'sent' : 'failed',
    result.id,
    result.error
  );

  return result;
}

// Get email logs for team
export async function getEmailLogs(
  db: D1Database,
  teamId: string,
  options?: {
    leadId?: string;
    status?: 'pending' | 'sent' | 'failed';
    limit?: number;
    offset?: number;
  }
): Promise<{ logs: EmailLog[]; total: number }> {
  const limit = options?.limit || 20;
  const offset = options?.offset || 0;

  let whereClause = 'WHERE team_id = ?';
  const params: unknown[] = [teamId];

  if (options?.leadId) {
    whereClause += ' AND lead_id = ?';
    params.push(options.leadId);
  }

  if (options?.status) {
    whereClause += ' AND status = ?';
    params.push(options.status);
  }

  // Get total count
  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM email_logs ${whereClause}`
  ).bind(...params).first<{ count: number }>();

  const total = countResult?.count || 0;

  // Get logs
  const results = await db.prepare(
    `SELECT * FROM email_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all<EmailLog>();

  return {
    logs: results.results,
    total,
  };
}
