import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types/env';
import { success, error, ErrorCodes, HttpStatus } from './utils/response';
import authRoutes from './routes/auth';
import leadsRoutes from './routes/leads';
import pipelineRoutes from './routes/pipeline';
import dashboardRoutes from './routes/dashboard';
import teamRoutes from './routes/team';
import exportRoutes from './routes/export';
import { processPendingJobs, cleanupOldJobs } from './services/job-processor';

// Create Hono app with environment typing
const app = new Hono<{ Bindings: Env }>();

// Apply global middleware
app.use('*', logger());
app.use('*', secureHeaders());

// CORS configuration
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://leadflow-ai.pages.dev',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check endpoint
app.get('/health', (c) => {
  return success(c, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API info endpoint
app.get('/api', (c) => {
  return success(c, {
    name: 'LeadFlow AI API',
    version: '1.0.0',
    description: 'A lightweight, mobile-first CRM for small businesses',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        changePassword: 'POST /api/auth/change-password',
      },
      leads: {
        list: 'GET /api/leads',
        create: 'POST /api/leads',
        get: 'GET /api/leads/:id',
        update: 'PUT /api/leads/:id',
        delete: 'DELETE /api/leads/:id',
        stage: 'PATCH /api/leads/:id/stage',
        note: 'POST /api/leads/:id/notes',
        activities: 'GET /api/leads/:id/activities',
      },
      pipeline: {
        list: 'GET /api/pipeline',
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats',
        refresh: 'POST /api/dashboard/refresh',
      },
      team: {
        get: 'GET /api/team',
        update: 'PUT /api/team',
        members: 'GET /api/team/members',
        invite: 'POST /api/team/invite',
        removeMember: 'DELETE /api/team/members/:memberId',
      },
      export: {
        leads: 'GET /api/export/leads',
      },
    },
  });
});

// Database connection test
app.get('/api/db-test', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare('SELECT 1 as test').first();

    if (result) {
      return success(c, {
        connected: true,
        message: 'Database connection successful',
      });
    }

    return error(
      c,
      ErrorCodes.DATABASE_ERROR,
      'Database connection failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  } catch (err) {
    return error(
      c,
      ErrorCodes.DATABASE_ERROR,
      'Database connection error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: err instanceof Error ? err.message : 'Unknown error' }
    );
  }
});

// KV connection test
app.get('/api/kv-test', async (c) => {
  try {
    const kv = c.env.KV;
    const testKey = 'test:connection';
    const testValue = { timestamp: new Date().toISOString() };

    await kv.put(testKey, JSON.stringify(testValue), { expirationTtl: 60 });
    const retrieved = await kv.get(testKey);

    if (retrieved) {
      await kv.delete(testKey);
      return success(c, {
        connected: true,
        message: 'KV connection successful',
      });
    }

    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'KV connection failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  } catch (err) {
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'KV connection error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: err instanceof Error ? err.message : 'Unknown error' }
    );
  }
});

// API Routes
app.route('/api/auth', authRoutes);
app.route('/api/leads', leadsRoutes);
app.route('/api/pipeline', pipelineRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/team', teamRoutes);
app.route('/api/export', exportRoutes);

// Manual job processing endpoint (for testing)
app.post('/api/admin/process-jobs', async (c) => {
  try {
    // Simple auth check - in production, add proper admin auth
    const authHeader = c.req.header('Authorization');
    if (authHeader !== `Bearer ${c.env.JWT_SECRET}`) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const result = await processPendingJobs(
      c.env.DB,
      c.env.KV,
      c.env.RESEND_API_KEY,
      20
    );

    return success(c, {
      message: 'Jobs processed',
      ...result,
    });
  } catch (err) {
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to process jobs',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: err instanceof Error ? err.message : 'Unknown error' }
    );
  }
});

// 404 handler
app.notFound((c) => {
  return error(
    c,
    ErrorCodes.NOT_FOUND,
    'Endpoint not found',
    HttpStatus.NOT_FOUND
  );
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return error(
    c,
    ErrorCodes.INTERNAL_ERROR,
    'An unexpected error occurred',
    HttpStatus.INTERNAL_SERVER_ERROR,
    { error: err.message }
  );
});

// Export the app for Cloudflare Workers
export default app;

// ================================================
// CRON TRIGGER HANDLER (FREE alternative to Queues)
// ================================================
// This runs automatically on a schedule defined in wrangler.toml
// No paid plan required!
export const scheduled: ExportedHandler<Env>['scheduled'] = async (
  event,
  env,
  ctx
) => {
  console.log('Cron triggered at:', new Date().toISOString());
  console.log('Cron:', event.cron);

  try {
    // Process pending email jobs
    const jobResult = await processPendingJobs(
      env.DB,
      env.KV,
      env.RESEND_API_KEY,
      20 // Process up to 20 jobs per run
    );

    console.log('Jobs processed:', jobResult);

    // Clean up old jobs weekly
    if (event.cron === '0 0 * * 0') { // Sunday at midnight
      const cleaned = await cleanupOldJobs(env.DB, 7);
      console.log('Old jobs cleaned:', cleaned);
    }

    // Return success
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      jobs: jobResult,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cron error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
