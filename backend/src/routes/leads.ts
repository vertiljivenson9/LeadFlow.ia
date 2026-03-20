import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, LeadSource, LeadStage } from '../types/env';
import { success, error, ErrorCodes, HttpStatus, paginationMeta } from '../utils/response';
import { apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentUser, getCurrentTeamId } from '../middleware/auth';
import {
  createLead,
  getLeadById,
  listLeads,
  updateLead,
  updateLeadStage,
  deleteLead,
  addNoteToLead,
  getLeadActivities,
} from '../services/lead';
import { createJob } from '../services/job-processor';

const leads = new Hono<{ Bindings: Env }>();

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.enum(['website', 'referral', 'social', 'email', 'phone', 'event', 'manual', 'other']).optional(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
});

const updateLeadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.enum(['website', 'referral', 'social', 'email', 'phone', 'event', 'manual', 'other']).optional(),
  stage: z.enum(['new', 'contacted', 'interested', 'closed']).optional(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
});

const updateStageSchema = z.object({
  stage: z.enum(['new', 'contacted', 'interested', 'closed']),
});

const addNoteSchema = z.object({
  note: z.string().min(1, 'Note is required').max(5000),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stage: z.enum(['new', 'contacted', 'interested', 'closed']).optional(),
  source: z.enum(['website', 'referral', 'social', 'email', 'phone', 'event', 'manual', 'other']).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['name', 'score', 'created_at', 'updated_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  assignedUserId: z.string().optional(),
});

// List leads
leads.get('/', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const queryParams = Object.fromEntries(
      new URL(c.req.url).searchParams.entries()
    );
    
    const result = querySchema.safeParse(queryParams);
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid query parameters',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { leads: leadList, total } = await listLeads(c.env.DB, teamId, result.data);

    return success(c, leadList, HttpStatus.OK, paginationMeta(result.data.page, result.data.limit, total));
  } catch (err) {
    console.error('List leads error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to list leads',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Create lead
leads.post('/', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const body = await c.req.json();
    const result = createLeadSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const lead = await createLead(c.env.DB, teamId, {
      ...result.data,
      source: result.data.source as LeadSource | undefined,
    }, user.userId);

    // Create follow-up email job (processed by Cron Trigger - FREE!)
    // The job will be processed within 5 minutes by the scheduled worker
    try {
      await createJob(c.env.DB, {
        teamId,
        jobType: 'send_follow_up',
        leadId: lead.id,
        payload: { leadName: lead.name },
      });
      console.log(`Follow-up job created for lead ${lead.id}`);
    } catch (jobError) {
      console.error('Failed to create follow-up job:', jobError);
      // Don't fail the request if job creation fails
    }
    
    return success(c, {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      source: lead.source,
      stage: lead.stage,
      score: lead.score,
      notes: lead.notes,
      customFields: lead.custom_fields ? JSON.parse(lead.custom_fields) : null,
      assignedUserId: lead.assigned_user_id,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
    }, HttpStatus.CREATED);
  } catch (err) {
    console.error('Create lead error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to create lead',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Get lead by ID
leads.get('/:id', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    const lead = await getLeadById(c.env.DB, leadId, teamId);

    if (!lead) {
      return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
    }

    return success(c, {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      source: lead.source,
      stage: lead.stage,
      score: lead.score,
      notes: lead.notes,
      customFields: lead.custom_fields ? JSON.parse(lead.custom_fields) : null,
      assignedUserId: lead.assigned_user_id,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      lastContactedAt: lead.last_contacted_at,
      closedAt: lead.closed_at,
    });
  } catch (err) {
    console.error('Get lead error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get lead',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Update lead
leads.put('/:id', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    const body = await c.req.json();
    const result = updateLeadSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const lead = await updateLead(c.env.DB, leadId, teamId, {
      ...result.data,
      source: result.data.source as LeadSource | undefined,
      stage: result.data.stage as LeadStage | undefined,
    }, user.userId);

    if (!lead) {
      return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
    }

    return success(c, {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      source: lead.source,
      stage: lead.stage,
      score: lead.score,
      notes: lead.notes,
      customFields: lead.custom_fields ? JSON.parse(lead.custom_fields) : null,
      assignedUserId: lead.assigned_user_id,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
    });
  } catch (err) {
    console.error('Update lead error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update lead',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Update lead stage
leads.patch('/:id/stage', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    const body = await c.req.json();
    const result = updateStageSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const lead = await updateLeadStage(
      c.env.DB,
      leadId,
      teamId,
      result.data.stage as LeadStage,
      user.userId
    );

    if (!lead) {
      return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
    }

    return success(c, {
      id: lead.id,
      stage: lead.stage,
      score: lead.score,
      updatedAt: lead.updated_at,
    });
  } catch (err) {
    console.error('Update stage error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update stage',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Add note to lead
leads.post('/:id/notes', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    const body = await c.req.json();
    const result = addNoteSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    try {
      const activity = await addNoteToLead(c.env.DB, leadId, teamId, result.data.note, user.userId);
      return success(c, {
        id: activity.id,
        type: activity.type,
        description: activity.description,
        createdAt: activity.created_at,
      }, HttpStatus.CREATED);
    } catch (err) {
      if (err instanceof Error && err.message === 'Lead not found') {
        return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
      }
      throw err;
    }
  } catch (err) {
    console.error('Add note error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to add note',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Get lead activities
leads.get('/:id/activities', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    
    // Check if lead exists
    const lead = await getLeadById(c.env.DB, leadId, teamId);
    if (!lead) {
      return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
    }

    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);

    const { activities, total } = await getLeadActivities(c.env.DB, leadId, teamId, page, limit);

    return success(c, activities.map(a => ({
      id: a.id,
      type: a.type,
      description: a.description,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      userId: a.user_id,
      createdAt: a.created_at,
    })), HttpStatus.OK, paginationMeta(page, limit, total));
  } catch (err) {
    console.error('Get activities error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get activities',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Delete lead
leads.delete('/:id', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const leadId = c.req.param('id');
    const deleted = await deleteLead(c.env.DB, leadId, teamId);

    if (!deleted) {
      return error(c, ErrorCodes.LEAD_NOT_FOUND, 'Lead not found', HttpStatus.NOT_FOUND);
    }

    return success(c, { message: 'Lead deleted successfully' });
  } catch (err) {
    console.error('Delete lead error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to delete lead',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

export default leads;
