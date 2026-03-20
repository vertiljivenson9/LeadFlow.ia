import type { D1Database } from '@cloudflare/workers-types';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { User } from '../types/env';
import { execute, newId, timestamp } from '../utils/db';
import {
  createJwt,
  hashToken,
  verifyJwt,
} from '../utils/crypto';

// Token expiration times (in seconds)
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Generate access and refresh tokens
export async function generateTokens(
  user: User,
  jwtSecret: string,
  refreshSecret: string
): Promise<TokenPair> {
  // Create access token
  const accessPayload = {
    userId: user.id,
    teamId: user.team_id,
    role: user.role,
    email: user.email,
  };
  
  const accessToken = await createJwt(
    accessPayload,
    jwtSecret,
    ACCESS_TOKEN_EXPIRY
  );

  // Create refresh token
  // Note: We generate a unique token ID for tracking purposes
  const refreshTokenId = newId();
  
  // Create refresh token JWT
  const refreshPayload = {
    userId: user.id,
    tokenId: refreshTokenId,
  };
  
  const refreshTokenJwt = await createJwt(
    refreshPayload,
    refreshSecret,
    REFRESH_TOKEN_EXPIRY
  );

  return {
    accessToken,
    refreshToken: refreshTokenJwt,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

// Store refresh token in KV
export async function storeRefreshToken(
  kv: KVNamespace,
  userId: string,
  token: string
): Promise<void> {
  const tokenHash = await hashToken(token);
  const key = `refresh_token:${userId}:${tokenHash}`;
  
  await kv.put(key, JSON.stringify({
    userId,
    tokenHash,
    createdAt: new Date().toISOString(),
  }), {
    expirationTtl: REFRESH_TOKEN_EXPIRY,
  });
}

// Store refresh token in D1 (backup)
export async function storeRefreshTokenDb(
  db: D1Database,
  userId: string,
  token: string
): Promise<void> {
  const tokenHash = await hashToken(token);
  const id = newId();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString();
  
  await execute(
    db,
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, tokenHash, expiresAt, timestamp()]
  );
}

// Verify refresh token from KV
export async function verifyRefreshToken(
  kv: KVNamespace,
  userId: string,
  token: string
): Promise<boolean> {
  const tokenHash = await hashToken(token);
  const key = `refresh_token:${userId}:${tokenHash}`;
  
  const stored = await kv.get(key);
  return stored !== null;
}

// Revoke refresh token
export async function revokeRefreshToken(
  kv: KVNamespace,
  db: D1Database,
  userId: string,
  token: string
): Promise<void> {
  const tokenHash = await hashToken(token);
  const key = `refresh_token:${userId}:${tokenHash}`;
  
  // Remove from KV
  await kv.delete(key);
  
  // Remove from D1
  await execute(
    db,
    `DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash = ?`,
    [userId, tokenHash]
  );
}

// Revoke all refresh tokens for a user
export async function revokeAllRefreshTokens(
  _kv: KVNamespace,
  db: D1Database,
  userId: string
): Promise<void> {
  // Delete all from D1
  await execute(
    db,
    `DELETE FROM refresh_tokens WHERE user_id = ?`,
    [userId]
  );
  
  // Note: KV doesn't support listing keys with prefix in a single operation
  // In production, you'd need to track token IDs or use a different approach
}

// Validate refresh token JWT
export async function validateRefreshTokenJwt(
  token: string,
  refreshSecret: string
): Promise<{ userId: string; tokenId: string } | null> {
  try {
    const payload = await verifyJwt(token, refreshSecret);
    
    if (!payload || !payload.userId || !payload.tokenId) {
      return null;
    }
    
    return {
      userId: payload.userId as string,
      tokenId: payload.tokenId as string,
    };
  } catch {
    return null;
  }
}

// Clean up expired refresh tokens
export async function cleanupExpiredTokens(
  db: D1Database
): Promise<void> {
  await execute(
    db,
    `DELETE FROM refresh_tokens WHERE expires_at < datetime('now')`,
    []
  );
}
