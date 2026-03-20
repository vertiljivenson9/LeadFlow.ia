import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { success, error, ErrorCodes, HttpStatus } from '../utils/response';
import { authRateLimit, apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import {
  createUser,
  findUserByEmail,
  findUserById,
  emailExists,
  updateUser,
} from '../services/user';
import {
  generateTokens,
  storeRefreshToken,
  storeRefreshTokenDb,
  verifyRefreshToken,
  revokeRefreshToken,
  validateRefreshTokenJwt,
} from '../services/token';
import { verifyPassword, hashPassword } from '../utils/crypto';

const auth = new Hono<{ Bindings: Env }>();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  teamName: z.string().min(1, 'Team name is required').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// Register endpoint
auth.post('/register', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const result = registerSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { email, password, firstName, lastName, teamName } = result.data;
    const db = c.env.DB;

    // Check if email already exists
    const existingUser = await emailExists(db, email);
    if (existingUser) {
      return error(
        c,
        ErrorCodes.EMAIL_EXISTS,
        'An account with this email already exists',
        HttpStatus.CONFLICT
      );
    }

    // Create user and team
    const { user, team } = await createUser(db, {
      email,
      password,
      firstName,
      lastName,
      teamName,
    });

    // Generate tokens
    const tokens = await generateTokens(
      user,
      c.env.JWT_SECRET,
      c.env.JWT_REFRESH_SECRET
    );

    // Store refresh token
    await storeRefreshToken(c.env.KV, user.id, tokens.refreshToken);
    await storeRefreshTokenDb(db, user.id, tokens.refreshToken);

    // Set HTTP-only cookie for refresh token
    setRefreshTokenCookie(c, tokens.refreshToken);

    return success(c, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        teamId: user.team_id,
      },
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    }, HttpStatus.CREATED);
  } catch (err) {
    console.error('Registration error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Registration failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Login endpoint
auth.post('/login', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const result = loginSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { email, password } = result.data;
    const db = c.env.DB;

    // Find user
    const user = await findUserByEmail(db, email);
    if (!user) {
      return error(
        c,
        ErrorCodes.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return error(
        c,
        ErrorCodes.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Get team
    const team = await db.prepare('SELECT * FROM teams WHERE id = ?')
      .bind(user.team_id)
      .first();

    // Generate tokens
    const tokens = await generateTokens(
      user,
      c.env.JWT_SECRET,
      c.env.JWT_REFRESH_SECRET
    );

    // Store refresh token
    await storeRefreshToken(c.env.KV, user.id, tokens.refreshToken);
    await storeRefreshTokenDb(db, user.id, tokens.refreshToken);

    // Set HTTP-only cookie
    setRefreshTokenCookie(c, tokens.refreshToken);

    return success(c, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        teamId: user.team_id,
      },
      team: team ? {
        id: team.id as string,
        name: team.name as string,
        slug: team.slug as string,
      } : null,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Login failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Refresh token endpoint
auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const result = refreshTokenSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { refreshToken } = result.data;
    const db = c.env.DB;

    // Validate refresh token JWT
    const tokenData = await validateRefreshTokenJwt(
      refreshToken,
      c.env.JWT_REFRESH_SECRET
    );

    if (!tokenData) {
      return error(
        c,
        ErrorCodes.INVALID_TOKEN,
        'Invalid refresh token',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Verify token exists in storage
    const isValid = await verifyRefreshToken(c.env.KV, tokenData.userId, refreshToken);
    if (!isValid) {
      return error(
        c,
        ErrorCodes.INVALID_TOKEN,
        'Refresh token not found or expired',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Get user
    const user = await findUserById(db, tokenData.userId);
    if (!user || !user.is_active) {
      return error(
        c,
        ErrorCodes.USER_NOT_FOUND,
        'User not found or inactive',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Revoke old refresh token
    await revokeRefreshToken(c.env.KV, db, tokenData.userId, refreshToken);

    // Generate new tokens
    const tokens = await generateTokens(
      user,
      c.env.JWT_SECRET,
      c.env.JWT_REFRESH_SECRET
    );

    // Store new refresh token
    await storeRefreshToken(c.env.KV, user.id, tokens.refreshToken);
    await storeRefreshTokenDb(db, user.id, tokens.refreshToken);

    // Set new cookie
    setRefreshTokenCookie(c, tokens.refreshToken);

    return success(c, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Token refresh failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Logout endpoint
auth.post('/logout', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return error(
        c,
        ErrorCodes.UNAUTHORIZED,
        'Not authenticated',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Get refresh token from cookie or body
    let refreshToken = getRefreshTokenFromCookie(c);
    
    if (!refreshToken) {
      try {
        const body = await c.req.json();
        refreshToken = body.refreshToken;
      } catch {
        // No body, continue
      }
    }

    if (refreshToken) {
      // Revoke refresh token
      await revokeRefreshToken(c.env.KV, c.env.DB, user.userId, refreshToken);
    }

    // Clear cookie
    clearRefreshTokenCookie(c);

    return success(c, { message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Logout failed',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Get current user endpoint
auth.get('/me', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return error(
        c,
        ErrorCodes.UNAUTHORIZED,
        'Not authenticated',
        HttpStatus.UNAUTHORIZED
      );
    }

    const db = c.env.DB;
    
    // Get full user data
    const fullUser = await findUserById(db, user.userId);
    if (!fullUser) {
      return error(
        c,
        ErrorCodes.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Get team
    const team = await db.prepare('SELECT * FROM teams WHERE id = ?')
      .bind(fullUser.team_id)
      .first();

    return success(c, {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        firstName: fullUser.first_name,
        lastName: fullUser.last_name,
        role: fullUser.role,
        teamId: fullUser.team_id,
        createdAt: fullUser.created_at,
      },
      team: team ? {
        id: team.id as string,
        name: team.name as string,
        slug: team.slug as string,
      } : null,
    });
  } catch (err) {
    console.error('Get user error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get user',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Change password endpoint
auth.post('/change-password', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return error(
        c,
        ErrorCodes.UNAUTHORIZED,
        'Not authenticated',
        HttpStatus.UNAUTHORIZED
      );
    }

    const body = await c.req.json();
    const result = changePasswordSchema.safeParse(body);
    
    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    const { currentPassword, newPassword } = result.data;
    const db = c.env.DB;

    // Get user
    const fullUser = await findUserById(db, user.userId);
    if (!fullUser) {
      return error(
        c,
        ErrorCodes.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, fullUser.password_hash);
    if (!isValid) {
      return error(
        c,
        ErrorCodes.INVALID_CREDENTIALS,
        'Current password is incorrect',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await updateUser(db, user.userId, { passwordHash: newPasswordHash });

    return success(c, { message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to change password',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Helper: Set refresh token cookie
function setRefreshTokenCookie(c: any, token: string): void {
  c.cookie('refreshToken', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}

// Helper: Get refresh token from cookie
function getRefreshTokenFromCookie(c: any): string | null {
  return c.req.header('cookie')
    ?.split(';')
    .find((c: string) => c.trim().startsWith('refreshToken='))
    ?.split('=')[1] || null;
}

// Helper: Clear refresh token cookie
function clearRefreshTokenCookie(c: any): void {
  c.cookie('refreshToken', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 0,
    path: '/',
  });
}

export default auth;
