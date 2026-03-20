// Cloudflare Pages Functions - API Handler
// Este archivo maneja TODAS las rutas /api/*

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sign, verify } from 'jsonwebtoken';
import { hash, compare } from 'bcryptjs';
import { z } from 'zod';

// ================================================
// TYPES
// ================================================
interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  RESEND_API_KEY: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  value?: number;
  stage: string;
  source?: string;
  notes?: string;
  organization_id: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

// ================================================
// HELPERS
// ================================================
const success = (data: any) => Response.json({ success: true, data });
const error = (message: string, status = 400) => 
  new Response(JSON.stringify({ success: false, error: message }), { 
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const generateId = () => crypto.randomUUID();
const generateToken = (userId: string, secret: string) => 
  sign({ userId }, secret, { expiresIn: '15m' });
const generateRefreshToken = (userId: string, secret: string) => 
  sign({ userId, type: 'refresh' }, secret, { expiresIn: '7d' });

// ================================================
// AUTH MIDDLEWARE
// ================================================
async function authMiddleware(request: Request, env: Env): Promise<User | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = authHeader.slice(7);
  try {
    const decoded = verify(token, env.JWT_SECRET) as { userId: string };
    const user = await env.DB.prepare(
      'SELECT id, email, name, organization_id, role FROM users WHERE id = ?'
    ).bind(decoded.userId).first() as User | null;
    return user;
  } catch {
    return null;
  }
}

// ================================================
// HONO APP
// ================================================
const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use('*', logger());

// ================================================
// HEALTH
// ================================================
app.get('/health', (c) => success({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api', (c) => success({ 
  name: 'LeadFlow AI API', 
  version: '1.0.0',
  endpoints: ['/api/auth/*', '/api/leads/*', '/api/dashboard/*', '/api/export/*']
}));

// ================================================
// AUTH ROUTES
// ================================================

// Register
app.post('/api/auth/register', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    organizationName: z.string().min(2).optional()
  });
  
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error('Datos inválidos');
  
  const { email, password, name, organizationName } = parsed.data;
  
  // Check existing user
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first();
  if (existing) return error('Email ya registrado', 409);
  
  // Create organization
  const orgId = generateId();
  await c.env.DB.prepare(
    'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)'
  ).bind(orgId, organizationName || `${name}'s Organization`, new Date().toISOString()).run();
  
  // Create user
  const userId = generateId();
  const passwordHash = await hash(password, 12);
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, organization_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, email, passwordHash, name, orgId, 'owner', new Date().toISOString()).run();
  
  // Generate tokens
  const accessToken = generateToken(userId, c.env.JWT_SECRET);
  const refreshToken = generateRefreshToken(userId, c.env.JWT_REFRESH_SECRET);
  
  // Store refresh token in KV
  await c.env.KV.put(`refresh:${userId}`, refreshToken, { expirationTtl: 604800 });
  
  return success({
    user: { id: userId, email, name, organization_id: orgId, role: 'owner' },
    accessToken,
    refreshToken
  });
});

// Login
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    password: z.string()
  });
  
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error('Credenciales inválidas');
  
  const { email, password } = parsed.data;
  
  // Find user
  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name, organization_id, role FROM users WHERE email = ?'
  ).bind(email).first() as User & { password_hash: string } | null;
  
  if (!user) return error('Credenciales inválidas', 401);
  
  // Verify password
  const valid = await compare(password, user.password_hash);
  if (!valid) return error('Credenciales inválidas', 401);
  
  // Generate tokens
  const accessToken = generateToken(user.id, c.env.JWT_SECRET);
  const refreshToken = generateRefreshToken(user.id, c.env.JWT_REFRESH_SECRET);
  
  await c.env.KV.put(`refresh:${user.id}`, refreshToken, { expirationTtl: 604800 });
  
  return success({
    user: { id: user.id, email: user.email, name: user.name, organization_id: user.organization_id, role: user.role },
    accessToken,
    refreshToken
  });
});

// Get current user
app.get('/api/auth/me', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  return success({ user });
});

// ================================================
// LEADS ROUTES
// ================================================

// List leads
app.get('/api/leads', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const stage = c.req.query('stage');
  let query = 'SELECT * FROM leads WHERE organization_id = ?';
  const params: any[] = [user.organization_id];
  
  if (stage) {
    query += ' AND stage = ?';
    params.push(stage);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  return success({ leads: result.results });
});

// Create lead
app.post('/api/leads', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const body = await c.req.json();
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    company: z.string().optional(),
    value: z.number().optional(),
    stage: z.string().default('new'),
    source: z.string().optional(),
    notes: z.string().optional()
  });
  
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error('Datos inválidos');
  
  const leadId = generateId();
  const now = new Date().toISOString();
  
  await c.env.DB.prepare(`
    INSERT INTO leads (id, name, email, phone, company, value, stage, source, notes, organization_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    leadId, parsed.data.name, parsed.data.email, parsed.data.phone, parsed.data.company,
    parsed.data.value, parsed.data.stage, parsed.data.source, parsed.data.notes,
    user.organization_id, now, now
  ).run();
  
  // Queue welcome email
  await c.env.DB.prepare(`
    INSERT INTO queue_jobs (id, type, data, status, created_at)
    VALUES (?, 'send_email', ?, 'pending', ?)
  `).bind(generateId(), JSON.stringify({
    to: parsed.data.email,
    subject: 'Bienvenido',
    template: 'welcome',
    leadName: parsed.data.name
  }), now).run();
  
  return success({ 
    id: leadId, 
    ...parsed.data, 
    organization_id: user.organization_id,
    created_at: now 
  });
});

// Get lead
app.get('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const lead = await c.env.DB.prepare(
    'SELECT * FROM leads WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), user.organization_id).first();
  
  if (!lead) return error('Lead no encontrado', 404);
  return success({ lead });
});

// Update lead
app.put('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const leadId = c.req.param('id');
  const body = await c.req.json();
  
  // Check ownership
  const existing = await c.env.DB.prepare(
    'SELECT id FROM leads WHERE id = ? AND organization_id = ?'
  ).bind(leadId, user.organization_id).first();
  
  if (!existing) return error('Lead no encontrado', 404);
  
  const updates: string[] = [];
  const values: any[] = [];
  
  ['name', 'email', 'phone', 'company', 'value', 'stage', 'source', 'notes'].forEach(field => {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  });
  
  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(leadId);
    
    await c.env.DB.prepare(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
  }
  
  return success({ id: leadId, ...body });
});

// Delete lead
app.delete('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const result = await c.env.DB.prepare(
    'DELETE FROM leads WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), user.organization_id).run();
  
  return success({ deleted: true });
});

// Update stage
app.patch('/api/leads/:id/stage', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const body = await c.req.json();
  const { stage } = body;
  
  if (!stage) return error('Stage requerido');
  
  await c.env.DB.prepare(
    'UPDATE leads SET stage = ?, updated_at = ? WHERE id = ? AND organization_id = ?'
  ).bind(stage, new Date().toISOString(), c.req.param('id'), user.organization_id).run();
  
  return success({ id: c.req.param('id'), stage });
});

// ================================================
// PIPELINE ROUTES
// ================================================
app.get('/api/pipeline', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const stages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
  const result = await c.env.DB.prepare(`
    SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
    FROM leads WHERE organization_id = ?
    GROUP BY stage
  `).bind(user.organization_id).all();
  
  const pipeline = stages.map(stage => {
    const found = result.results.find((r: any) => r.stage === stage);
    return {
      stage,
      count: found?.count || 0,
      total_value: found?.total_value || 0
    };
  });
  
  return success({ pipeline });
});

// ================================================
// DASHBOARD ROUTES
// ================================================
app.get('/api/dashboard/stats', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  // Try cache first
  const cacheKey = `stats:${user.organization_id}`;
  const cached = await c.env.KV.get(cacheKey);
  if (cached) return success(JSON.parse(cached));
  
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_leads,
      COUNT(CASE WHEN stage = 'won' THEN 1 END) as won_leads,
      COALESCE(SUM(CASE WHEN stage = 'won' THEN value END), 0) as revenue,
      COALESCE(SUM(value), 0) as pipeline_value
    FROM leads WHERE organization_id = ?
  `).bind(user.organization_id).first();
  
  const result = {
    totalLeads: stats?.total_leads || 0,
    wonLeads: stats?.won_leads || 0,
    revenue: stats?.revenue || 0,
    pipelineValue: stats?.pipeline_value || 0,
    conversionRate: stats?.total_leads > 0 
      ? Math.round((stats.won_leads / stats.total_leads) * 100) 
      : 0
  };
  
  // Cache for 5 minutes
  await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
  
  return success(result);
});

// ================================================
// EXPORT ROUTES
// ================================================
app.get('/api/export/leads', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  const result = await c.env.DB.prepare(
    'SELECT * FROM leads WHERE organization_id = ? ORDER BY created_at DESC'
  ).bind(user.organization_id).all();
  
  // Generate CSV
  const leads = result.results as Lead[];
  const headers = ['ID', 'Name', 'Email', 'Phone', 'Company', 'Value', 'Stage', 'Source', 'Created'];
  const rows = leads.map(l => [
    l.id, l.name, l.email, l.phone || '', l.company || '', 
    l.value?.toString() || '0', l.stage, l.source || '', l.created_at
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  // Store in R2
  const key = `exports/${user.organization_id}/${Date.now()}.csv`;
  await c.env.R2.put(key, csv, { httpMetadata: { contentType: 'text/csv' } });
  
  return success({ 
    message: 'Export created',
    count: leads.length,
    downloadUrl: `/api/export/download/${key.split('/').pop()}`
  });
});

// ================================================
// ERROR HANDLERS
// ================================================
app.notFound((c) => error('Not found', 404));
app.onError((err, c) => {
  console.error('Error:', err);
  return error('Internal server error', 500);
});

// ================================================
// EXPORT FOR PAGES FUNCTIONS
// ================================================
export const onRequest: PagesFunction<Env> = async (context) => {
  return app.fetch(context.request, context.env, context.executionCtx);
};
