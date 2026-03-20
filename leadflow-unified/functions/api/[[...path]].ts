// Cloudflare Pages Functions - API Handler
// Maneja TODAS las rutas /api/*

import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ================================================
// HEALTH
// ================================================
app.get('/health', (c) => success({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api', (c) => success({ 
  name: 'LeadFlow AI API', 
  version: '1.0.0',
  endpoints: ['/api/auth/*', '/api/leads/*', '/api/dashboard/*']
}));

// ================================================
// AUTH ROUTES
// ================================================

// Register
app.post('/api/auth/register', async (c) => {
  try {
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
  } catch (err) {
    console.error('Register error:', err);
    return error('Error al registrar usuario', 500);
  }
});

// Login
app.post('/api/auth/login', async (c) => {
  try {
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
  } catch (err) {
    console.error('Login error:', err);
    return error('Error al iniciar sesión', 500);
  }
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
  
  try {
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
  } catch (err) {
    console.error('Get leads error:', err);
    return error('Error al obtener leads', 500);
  }
});

// Create lead
app.post('/api/leads', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
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
      leadId, parsed.data.name, parsed.data.email, parsed.data.phone || null, parsed.data.company || null,
      parsed.data.value || 0, parsed.data.stage, parsed.data.source || null, parsed.data.notes || null,
      user.organization_id, now, now
    ).run();
    
    return success({ 
      id: leadId, 
      ...parsed.data, 
      organization_id: user.organization_id,
      created_at: now 
    });
  } catch (err) {
    console.error('Create lead error:', err);
    return error('Error al crear lead', 500);
  }
});

// Get lead
app.get('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
    const lead = await c.env.DB.prepare(
      'SELECT * FROM leads WHERE id = ? AND organization_id = ?'
    ).bind(c.req.param('id'), user.organization_id).first();
    
    if (!lead) return error('Lead no encontrado', 404);
    return success({ lead });
  } catch (err) {
    return error('Error al obtener lead', 500);
  }
});

// Update lead
app.put('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
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
  } catch (err) {
    return error('Error al actualizar lead', 500);
  }
});

// Delete lead
app.delete('/api/leads/:id', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
    await c.env.DB.prepare(
      'DELETE FROM leads WHERE id = ? AND organization_id = ?'
    ).bind(c.req.param('id'), user.organization_id).run();
    
    return success({ deleted: true });
  } catch (err) {
    return error('Error al eliminar lead', 500);
  }
});

// Update stage
app.patch('/api/leads/:id/stage', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
    const body = await c.req.json();
    const { stage } = body;
    
    if (!stage) return error('Stage requerido');
    
    await c.env.DB.prepare(
      'UPDATE leads SET stage = ?, updated_at = ? WHERE id = ? AND organization_id = ?'
    ).bind(stage, new Date().toISOString(), c.req.param('id'), user.organization_id).run();
    
    return success({ id: c.req.param('id'), stage });
  } catch (err) {
    return error('Error al actualizar stage', 500);
  }
});

// ================================================
// DASHBOARD ROUTES
// ================================================
app.get('/api/dashboard/stats', async (c) => {
  const user = await authMiddleware(c.req.raw, c.env);
  if (!user) return error('No autorizado', 401);
  
  try {
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
      totalLeads: (stats?.total_leads as number) || 0,
      wonLeads: (stats?.won_leads as number) || 0,
      revenue: (stats?.revenue as number) || 0,
      pipelineValue: (stats?.pipeline_value as number) || 0,
      conversionRate: stats && (stats.total_leads as number) > 0 
        ? Math.round(((stats.won_leads as number) / (stats.total_leads as number)) * 100) 
        : 0
    };
    
    // Cache for 5 minutes
    await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    
    return success(result);
  } catch (err) {
    console.error('Dashboard error:', err);
    return error('Error al obtener estadísticas', 500);
  }
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
