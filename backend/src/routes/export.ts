import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, LeadStage, LeadSource } from '../types/env';
import { success, error, ErrorCodes, HttpStatus } from '../utils/response';
import { apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentTeamId, getCurrentUser } from '../middleware/auth';
import { createActivity } from '../services/lead';

const exportRoute = new Hono<{ Bindings: Env }>();

// Query schema for export
const exportQuerySchema = z.object({
  stage: z.enum(['new', 'contacted', 'interested', 'closed']).optional(),
  source: z.enum(['website', 'referral', 'social', 'email', 'phone', 'event', 'manual', 'other']).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

// Convert leads to CSV
function leadsToCSV(leads: Record<string, unknown>[]): string {
  if (leads.length === 0) {
    return 'No leads to export';
  }

  const headers = [
    'ID',
    'Name',
    'Email',
    'Phone',
    'Company',
    'Source',
    'Stage',
    'Score',
    'Notes',
    'Created At',
    'Updated At',
    'Last Contacted',
    'Closed At',
  ];

  const rows = leads.map((lead) => [
    lead.id as string,
    lead.name as string,
    (lead.email as string) || '',
    (lead.phone as string) || '',
    (lead.company as string) || '',
    lead.source as string,
    lead.stage as string,
    lead.score as number,
    ((lead.notes as string) || '').replace(/"/g, '""'),
    lead.created_at as string,
    lead.updated_at as string,
    (lead.last_contacted_at as string) || '',
    (lead.closed_at as string) || '',
  ]);

  const escapeCSV = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str}"`;
    }
    return str;
  };

  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvRows.join('\n');
}

// Export leads to CSV
exportRoute.get('/leads', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    const user = getCurrentUser(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const queryParams = Object.fromEntries(
      new URL(c.req.url).searchParams.entries()
    );

    const result = exportQuerySchema.safeParse(queryParams);
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid query parameters',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { stage, source, minScore, fromDate, toDate } = result.data;

    // Build query
    const conditions: string[] = ['team_id = ?'];
    const params: unknown[] = [teamId];

    if (stage) {
      conditions.push('stage = ?');
      params.push(stage);
    }

    if (source) {
      conditions.push('source = ?');
      params.push(source);
    }

    if (minScore !== undefined) {
      conditions.push('score >= ?');
      params.push(minScore);
    }

    if (fromDate) {
      conditions.push('date(created_at) >= ?');
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push('date(created_at) <= ?');
      params.push(toDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get leads
    const leadsResult = await c.env.DB.prepare(
      `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT 10000`
    ).bind(...params).all();

    const leads = leadsResult.results;

    // Generate CSV
    const csv = leadsToCSV(leads);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `leads-export-${timestamp}.csv`;

    // Store in R2
    const r2Key = `exports/${teamId}/${filename}`;
    await c.env.R2.put(r2Key, csv, {
      httpMetadata: {
        contentType: 'text/csv',
      },
      customMetadata: {
        teamId,
        exportedAt: new Date().toISOString(),
        count: String(leads.length),
      },
    });

    // Generate signed URL (valid for 1 hour)
    // Note: R2 public URL or signed URL generation
    // For now, return the key and let frontend handle download
    const signedUrl = await c.env.R2.createSignedUrl(r2Key, {
      expiresIn: 3600, // 1 hour
    });

    // Create activity for export
    await createActivity(c.env.DB, {
      leadId: leads.length === 1 ? (leads[0]!.id as string) : null,
      teamId,
      userId: user.userId,
      type: 'exported',
      description: `Exported ${leads.length} leads to CSV`,
      metadata: { count: leads.length, filename, filters: result.data },
    });

    return success(c, {
      url: signedUrl,
      filename,
      count: leads.length,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  } catch (err) {
    console.error('Export leads error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to export leads',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Download exported file
exportRoute.get('/download/:key', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const key = c.req.param('key');
    const fullKey = `exports/${teamId}/${key}`;

    const object = await c.env.R2.get(fullKey);

    if (!object) {
      return error(c, ErrorCodes.NOT_FOUND, 'Export file not found', HttpStatus.NOT_FOUND);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${key}"`);

    return new Response(object.body, { headers });
  } catch (err) {
    console.error('Download export error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to download export',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

export default exportRoute;
