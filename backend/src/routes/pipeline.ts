import { Hono } from 'hono';
import type { Env } from '../types/env';
import { success, error, ErrorCodes, HttpStatus } from '../utils/response';
import { apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentTeamId } from '../middleware/auth';
import { getPipeline } from '../services/lead';

const pipeline = new Hono<{ Bindings: Env }>();

// Get pipeline overview
pipeline.get('/', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const pipelineData = await getPipeline(c.env.DB, teamId);

    // Transform for response
    const response = {
      stages: [
        {
          name: 'new',
          label: 'New',
          count: pipelineData.new.length,
          leads: pipelineData.new.map(lead => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            score: lead.score,
            source: lead.source,
            createdAt: lead.created_at,
            lastContactedAt: lead.last_contacted_at,
          })),
        },
        {
          name: 'contacted',
          label: 'Contacted',
          count: pipelineData.contacted.length,
          leads: pipelineData.contacted.map(lead => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            score: lead.score,
            source: lead.source,
            createdAt: lead.created_at,
            lastContactedAt: lead.last_contacted_at,
          })),
        },
        {
          name: 'interested',
          label: 'Interested',
          count: pipelineData.interested.length,
          leads: pipelineData.interested.map(lead => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            score: lead.score,
            source: lead.source,
            createdAt: lead.created_at,
            lastContactedAt: lead.last_contacted_at,
          })),
        },
        {
          name: 'closed',
          label: 'Closed',
          count: pipelineData.closed.length,
          leads: pipelineData.closed.map(lead => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            score: lead.score,
            source: lead.source,
            createdAt: lead.created_at,
            closedAt: lead.closed_at,
          })),
        },
      ],
      totals: {
        total: pipelineData.new.length + pipelineData.contacted.length + 
               pipelineData.interested.length + pipelineData.closed.length,
        new: pipelineData.new.length,
        contacted: pipelineData.contacted.length,
        interested: pipelineData.interested.length,
        closed: pipelineData.closed.length,
      },
    };

    return success(c, response);
  } catch (err) {
    console.error('Get pipeline error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get pipeline',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

export default pipeline;
