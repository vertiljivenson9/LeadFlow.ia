import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { error, ErrorCodes, HttpStatus } from '../utils/response';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: Context<{ Bindings: Env }>) => string;
}

// Default rate limit configuration
const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyGenerator: (c) => {
    // Use IP address or user ID for rate limiting
    const user = c.get('user');
    if (user) {
      return `rate_limit:user:${user.userId}`;
    }
    
    // Fall back to IP address
    const ip = c.req.header('CF-Connecting-IP') || 
               c.req.header('X-Forwarded-For') || 
               'unknown';
    return `rate_limit:ip:${ip}`;
  },
};

// Stricter rate limit for auth endpoints
export const authRateLimitConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // Only 10 attempts per 15 minutes
  keyGenerator: (c) => {
    const ip = c.req.header('CF-Connecting-IP') || 
               c.req.header('X-Forwarded-For') || 
               'unknown';
    return `rate_limit:auth:${ip}`;
  },
};

// Rate limiting middleware factory
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | undefined> => {
    const key = finalConfig.keyGenerator!(c);
    const kv = c.env.KV;
    
    try {
      // Get current count
      const current = await kv.get(key);
      const count = current ? parseInt(current, 10) : 0;
      
      if (count >= finalConfig.maxRequests) {
        // Get TTL to calculate retry-after
        const metadata = await kv.getWithMetadata<{ resetAt: number }>(key);
        const retryAfter = metadata.metadata?.resetAt 
          ? Math.ceil((metadata.metadata.resetAt - Date.now()) / 1000)
          : finalConfig.windowMs / 1000;
        
        return error(
          c,
          ErrorCodes.RATE_LIMITED,
          'Too many requests, please try again later',
          HttpStatus.TOO_MANY_REQUESTS,
          { retryAfter }
        );
      }
      
      // Increment counter
      const resetAt = Date.now() + finalConfig.windowMs;
      
      if (count === 0) {
        // First request - set with expiration
        await kv.put(key, '1', {
          expirationTtl: Math.ceil(finalConfig.windowMs / 1000),
          metadata: { resetAt },
        });
      } else {
        // Increment existing counter
        await kv.put(key, String(count + 1), {
          expirationTtl: Math.ceil(finalConfig.windowMs / 1000),
          metadata: { resetAt },
        });
      }
      
      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(finalConfig.maxRequests));
      c.header('X-RateLimit-Remaining', String(finalConfig.maxRequests - count - 1));
      c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      
      await next();
      return;
    } catch (err) {
      console.error('Rate limiting error:', err);
      // On error, allow the request through
      await next();
      return;
    }
  };
}

// Pre-configured middleware instances
export const defaultRateLimit = rateLimitMiddleware();
export const authRateLimit = rateLimitMiddleware(authRateLimitConfig);
export const apiRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
});
