import type { Context, Next } from 'hono';
import type { Env, JwtPayload } from '../types/env';
import { verifyJwt } from '../utils/crypto';
import { error, ErrorCodes, HttpStatus } from '../utils/response';

// Extend Hono context with user property
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
    teamId: string;
  }
}

// Type guard to validate JWT payload structure
function isValidJwtPayload(payload: unknown): payload is JwtPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.userId === 'string' &&
    typeof p.teamId === 'string' &&
    (p.role === 'admin' || p.role === 'member') &&
    typeof p.email === 'string' &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number'
  );
}

// Auth middleware - verifies access token
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(
      c,
      ErrorCodes.UNAUTHORIZED,
      'Missing or invalid authorization header',
      HttpStatus.UNAUTHORIZED
    );
  }

  const token = authHeader.substring(7);
  
  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    
    if (!payload || !isValidJwtPayload(payload)) {
      return error(
        c,
        ErrorCodes.INVALID_TOKEN,
        'Invalid or expired token',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Set user in context
    c.set('user', payload);
    c.set('teamId', payload.teamId);
    
    await next();
    return;
  } catch (err) {
    return error(
      c,
      ErrorCodes.INVALID_TOKEN,
      'Token verification failed',
      HttpStatus.UNAUTHORIZED,
      { error: err instanceof Error ? err.message : 'Unknown error' }
    );
  }
}

// Optional auth middleware - doesn't require auth but extracts user if present
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const payload = await verifyJwt(token, c.env.JWT_SECRET);
      
      if (payload && isValidJwtPayload(payload)) {
        c.set('user', payload);
        c.set('teamId', payload.teamId);
      }
    } catch {
      // Silently ignore invalid tokens in optional auth
    }
  }
  
  await next();
}

// Admin role middleware
export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | undefined> {
  const user = c.get('user');
  
  if (!user || user.role !== 'admin') {
    return error(
      c,
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      'Admin access required',
      HttpStatus.FORBIDDEN
    );
  }
  
  await next();
  return;
}

// Get current user from context
export function getCurrentUser(c: Context<{ Bindings: Env }>): JwtPayload | undefined {
  return c.get('user');
}

// Get current team ID from context
export function getCurrentTeamId(c: Context<{ Bindings: Env }>): string | undefined {
  return c.get('teamId');
}
