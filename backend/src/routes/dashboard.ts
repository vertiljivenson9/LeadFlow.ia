import { Hono } from 'hono';
import type { Env } from '../types/env';
import { success, error, ErrorCodes, HttpStatus } from '../utils/response';
import { apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentTeamId } from '../middleware/auth';
import { getDashboardStats, invalidateDashboardCache } from '../services/dashboard';

const dashboard = new Hono<{ Bindings: Env }>();

// Get dashboard stats
dashboard.get('/stats', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const forceRefresh = c.req.query('refresh') === 'true';
    const stats = await getDashboardStats(c.env.DB, c.env.KV, teamId, forceRefresh);

    return success(c, stats);
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get dashboard stats',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Refresh dashboard cache
dashboard.post('/refresh', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    // Invalidate cache and get fresh stats
    await invalidateDashboardCache(c.env.KV, teamId);
    const stats = await getDashboardStats(c.env.DB, c.env.KV, teamId, true);

    return success(c, {
      message: 'Dashboard cache refreshed',
      stats,
    });
  } catch (err) {
    console.error('Refresh dashboard error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to refresh dashboard',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

export default dashboard;
