import type { D1Database } from '@cloudflare/workers-types';
import type { Lead, Activity, LeadSource, LeadStage, ActivityType } from '../types/env';
import { queryOne, execute, newId, timestamp, safeJsonStringify } from '../utils/db';

// Source weights for scoring
const SOURCE_WEIGHTS: Record<LeadSource, number> = {
  referral: 40,
  website: 30,
  event: 25,
  social: 20,
  email: 15,
  phone: 15,
  manual: 10,
  other: 5,
};

export interface CreateLeadData {
  name: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  company?: string | null | undefined;
  source?: LeadSource | undefined;
  notes?: string | null | undefined;
  customFields?: Record<string, unknown> | null | undefined;
  assignedUserId?: string | null | undefined;
}

export interface UpdateLeadData {
  name?: string | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  company?: string | null | undefined;
  source?: LeadSource | undefined;
  stage?: LeadStage | undefined;
  notes?: string | null | undefined;
  customFields?: Record<string, unknown> | null | undefined;
  assignedUserId?: string | null | undefined;
}

export interface LeadsQuery {
  stage?: LeadStage | undefined;
  source?: LeadSource | undefined;
  search?: string | undefined;
  sortBy?: 'name' | 'score' | 'created_at' | 'updated_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  assignedUserId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

// Calculate lead score based on source, activity, and recency
export function calculateLeadScore(
  source: LeadSource,
  createdAt: string,
  activityCount: number = 0
): number {
  // Source weight (0-40 points)
  const sourceScore = SOURCE_WEIGHTS[source] || 5;

  // Recency score (0-30 points)
  const createdDate = new Date(createdAt);
  const daysSinceCreated = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
  let recencyScore = 30;
  if (daysSinceCreated > 30) {
    recencyScore = 10;
  } else if (daysSinceCreated > 14) {
    recencyScore = 20;
  } else if (daysSinceCreated > 7) {
    recencyScore = 25;
  }

  // Activity score (0-30 points)
  const activityScore = Math.min(activityCount * 5, 30);

  return Math.min(sourceScore + recencyScore + activityScore, 100);
}

// Create a new lead
export async function createLead(
  db: D1Database,
  teamId: string,
  data: CreateLeadData,
  userId?: string
): Promise<Lead> {
  const id = newId();
  const now = timestamp();
  const source = data.source || 'manual';
  const score = calculateLeadScore(source, now, 0);

  const customFieldsJson = safeJsonStringify(data.customFields);

  await execute(
    db,
    `INSERT INTO leads (
      id, team_id, name, email, phone, company, source, stage, score, notes, 
      custom_fields, assigned_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, teamId, data.name, data.email || null, data.phone || null, 
      data.company || null, source, 'new', score, data.notes || null,
      customFieldsJson, data.assignedUserId || null, now, now
    ]
  );

  // Create activity for lead creation
  await createActivity(db, {
    leadId: id,
    teamId,
    userId: userId || null,
    type: 'created',
    description: `Lead "${data.name}" was created`,
    metadata: { source, score },
  });

  return {
    id,
    team_id: teamId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    company: data.company || null,
    source,
    stage: 'new',
    score,
    notes: data.notes || null,
    custom_fields: customFieldsJson,
    assigned_user_id: data.assignedUserId || null,
    created_at: now,
    updated_at: now,
    last_contacted_at: null,
    closed_at: null,
  };
}

// Get lead by ID
export async function getLeadById(
  db: D1Database,
  leadId: string,
  teamId: string
): Promise<Lead | null> {
  return queryOne<Lead>(
    db,
    `SELECT * FROM leads WHERE id = ? AND team_id = ?`,
    [leadId, teamId]
  );
}

// List leads with filtering and pagination
export async function listLeads(
  db: D1Database,
  teamId: string,
  query: LeadsQuery
): Promise<{ leads: Lead[]; total: number }> {
  const {
    stage,
    source,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    assignedUserId,
    page = 1,
    limit = 20,
  } = query;

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

  if (assignedUserId) {
    conditions.push('assigned_user_id = ?');
    params.push(assignedUserId);
  }

  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ? OR company LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;
  const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

  // Get total count
  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads ${whereClause}`
  ).bind(...params).first<{ count: number }>();
  
  const total = countResult?.count || 0;

  // Get leads
  const results = await db.prepare(
    `SELECT * FROM leads ${whereClause} ${orderClause} ${limitClause}`
  ).bind(...params).all<Lead>();

  return {
    leads: results.results,
    total,
  };
}

// Update lead
export async function updateLead(
  db: D1Database,
  leadId: string,
  teamId: string,
  data: UpdateLeadData,
  userId?: string
): Promise<Lead | null> {
  const existing = await getLeadById(db, leadId, teamId);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    params.push(data.phone);
  }
  if (data.company !== undefined) {
    updates.push('company = ?');
    params.push(data.company);
  }
  if (data.source !== undefined) {
    updates.push('source = ?');
    params.push(data.source);
  }
  if (data.stage !== undefined) {
    updates.push('stage = ?');
    params.push(data.stage);
    
    if (data.stage === 'closed') {
      updates.push('closed_at = ?');
      params.push(timestamp());
    }
  }
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    params.push(data.notes);
  }
  if (data.customFields !== undefined) {
    updates.push('custom_fields = ?');
    params.push(safeJsonStringify(data.customFields));
  }
  if (data.assignedUserId !== undefined) {
    updates.push('assigned_user_id = ?');
    params.push(data.assignedUserId);
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  params.push(timestamp());
  params.push(leadId, teamId);

  await execute(
    db,
    `UPDATE leads SET ${updates.join(', ')} WHERE id = ? AND team_id = ?`,
    params
  );

  // Create activity for stage change
  if (data.stage && data.stage !== existing.stage) {
    await createActivity(db, {
      leadId,
      teamId,
      userId: userId || null,
      type: 'stage_change',
      description: `Stage changed from "${existing.stage}" to "${data.stage}"`,
      metadata: { oldStage: existing.stage, newStage: data.stage },
    });
  }

  // Recalculate score if source changed
  if (data.source && data.source !== existing.source) {
    const newScore = calculateLeadScore(data.source, existing.created_at);
    await execute(
      db,
      `UPDATE leads SET score = ? WHERE id = ? AND team_id = ?`,
      [newScore, leadId, teamId]
    );
  }

  return getLeadById(db, leadId, teamId);
}

// Update lead stage
export async function updateLeadStage(
  db: D1Database,
  leadId: string,
  teamId: string,
  stage: LeadStage,
  userId?: string
): Promise<Lead | null> {
  return updateLead(db, leadId, teamId, { stage }, userId);
}

// Delete lead
export async function deleteLead(
  db: D1Database,
  leadId: string,
  teamId: string
): Promise<boolean> {
  const result = await execute(
    db,
    `DELETE FROM leads WHERE id = ? AND team_id = ?`,
    [leadId, teamId]
  );
  return result.changes > 0;
}

// Add note to lead
export async function addNoteToLead(
  db: D1Database,
  leadId: string,
  teamId: string,
  note: string,
  userId?: string
): Promise<Activity> {
  // Update lead notes
  const lead = await getLeadById(db, leadId, teamId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  const existingNotes = lead.notes || '';
  const updatedNotes = existingNotes 
    ? `${existingNotes}\n\n---\n${new Date().toLocaleDateString()}: ${note}`
    : note;

  await execute(
    db,
    `UPDATE leads SET notes = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
    [updatedNotes, timestamp(), leadId, teamId]
  );

  // Create activity
  return createActivity(db, {
    leadId,
    teamId,
    userId: userId || null,
    type: 'note_added',
    description: `Note added: "${note.slice(0, 100)}${note.length > 100 ? '...' : ''}"`,
    metadata: { note },
  });
}

// Create activity
export async function createActivity(
  db: D1Database,
  data: {
    leadId: string;
    teamId: string;
    userId: string | null;
    type: ActivityType;
    description: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<Activity> {
  const id = newId();
  const now = timestamp();
  const metadataJson = safeJsonStringify(data.metadata);

  await execute(
    db,
    `INSERT INTO activities (id, lead_id, team_id, user_id, type, description, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.leadId, data.teamId, data.userId, data.type, data.description, metadataJson, now]
  );

  return {
    id,
    lead_id: data.leadId,
    team_id: data.teamId,
    user_id: data.userId,
    type: data.type,
    description: data.description,
    metadata: metadataJson,
    created_at: now,
  };
}

// Get activities for a lead
export async function getLeadActivities(
  db: D1Database,
  leadId: string,
  teamId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ activities: Activity[]; total: number }> {
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM activities WHERE lead_id = ? AND team_id = ?`
  ).bind(leadId, teamId).first<{ count: number }>();
  
  const total = countResult?.count || 0;

  // Get activities
  const results = await db.prepare(
    `SELECT * FROM activities WHERE lead_id = ? AND team_id = ? 
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(leadId, teamId, limit, offset).all<Activity>();

  return {
    activities: results.results,
    total,
  };
}

// Get pipeline overview
export async function getPipeline(
  db: D1Database,
  teamId: string
): Promise<Record<LeadStage, Lead[]>> {
  const stages: LeadStage[] = ['new', 'contacted', 'interested', 'closed'];
  const pipeline: Record<LeadStage, Lead[]> = {
    new: [],
    contacted: [],
    interested: [],
    closed: [],
  };

  for (const stage of stages) {
    const results = await db.prepare(
      `SELECT * FROM leads WHERE team_id = ? AND stage = ? ORDER BY score DESC, created_at DESC`
    ).bind(teamId, stage).all<Lead>();
    
    pipeline[stage] = results.results;
  }

  return pipeline;
}

// Update last contacted timestamp
export async function updateLastContacted(
  db: D1Database,
  leadId: string,
  teamId: string
): Promise<void> {
  const now = timestamp();
  await execute(
    db,
    `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
    [now, now, leadId, teamId]
  );
}
