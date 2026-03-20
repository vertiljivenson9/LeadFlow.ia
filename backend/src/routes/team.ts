import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { success, error, ErrorCodes, HttpStatus } from '../utils/response';
import { apiRateLimit } from '../middleware/rateLimit';
import { authMiddleware, getCurrentUser, getCurrentTeamId } from '../middleware/auth';
import { findTeamById, getTeamMembers, addTeamMember, deactivateUser } from '../services/user';
import { hashPassword } from '../utils/crypto';
import { execute, newId, timestamp } from '../utils/db';

const team = new Hono<{ Bindings: Env }>();

// Update team schema
const updateTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100).optional(),
});

// Invite member schema
const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  role: z.enum(['admin', 'member']).default('member'),
});

// Get team info
team.get('/', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const teamData = await findTeamById(c.env.DB, teamId);
    if (!teamData) {
      return error(c, ErrorCodes.NOT_FOUND, 'Team not found', HttpStatus.NOT_FOUND);
    }

    return success(c, {
      id: teamData.id,
      name: teamData.name,
      slug: teamData.slug,
      createdAt: teamData.created_at,
      updatedAt: teamData.updated_at,
    });
  } catch (err) {
    console.error('Get team error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get team',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Update team
team.put('/', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    // Only admins can update team
    if (user.role !== 'admin') {
      return error(c, ErrorCodes.FORBIDDEN, 'Only admins can update team', HttpStatus.FORBIDDEN);
    }

    const body = await c.req.json();
    const result = updateTeamSchema.safeParse(body);

    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    if (result.data.name) {
      await execute(
        c.env.DB,
        `UPDATE teams SET name = ?, updated_at = ? WHERE id = ?`,
        [result.data.name, timestamp(), teamId]
      );
    }

    const teamData = await findTeamById(c.env.DB, teamId);
    return success(c, {
      id: teamData!.id,
      name: teamData!.name,
      slug: teamData!.slug,
      updatedAt: timestamp(),
    });
  } catch (err) {
    console.error('Update team error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update team',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Get team members
team.get('/members', authMiddleware, apiRateLimit, async (c) => {
  try {
    const teamId = getCurrentTeamId(c);
    if (!teamId) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Team not found', HttpStatus.UNAUTHORIZED);
    }

    const members = await getTeamMembers(c.env.DB, teamId);

    return success(c, members.map((m) => ({
      id: m.id,
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
      role: m.role,
      createdAt: m.created_at,
    })));
  } catch (err) {
    console.error('Get team members error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to get team members',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Invite team member
team.post('/invite', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    // Only admins can invite
    if (user.role !== 'admin') {
      return error(c, ErrorCodes.FORBIDDEN, 'Only admins can invite members', HttpStatus.FORBIDDEN);
    }

    const body = await c.req.json();
    const result = inviteMemberSchema.safeParse(body);

    if (!result.success) {
      return error(
        c,
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        HttpStatus.BAD_REQUEST,
        { errors: result.error.errors }
      );
    }

    // Check if email already exists in team
    const existingMember = await c.env.DB.prepare(
      `SELECT id FROM users WHERE email = ? AND team_id = ?`
    ).bind(result.data.email.toLowerCase(), teamId).first();

    if (existingMember) {
      return error(
        c,
        ErrorCodes.EMAIL_EXISTS,
        'A member with this email already exists',
        HttpStatus.CONFLICT
      );
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const userId = newId();
    const now = timestamp();

    await execute(
      c.env.DB,
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, team_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [userId, result.data.email.toLowerCase(), passwordHash, result.data.firstName, result.data.lastName, result.data.role, teamId, now, now]
    );

    // In production, send email with temp password
    // For now, return it in response

    return success(c, {
      id: userId,
      email: result.data.email,
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      role: result.data.role,
      tempPassword, // Remove in production
    }, HttpStatus.CREATED);
  } catch (err) {
    console.error('Invite member error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to invite member',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Remove team member
team.delete('/members/:memberId', authMiddleware, apiRateLimit, async (c) => {
  try {
    const user = getCurrentUser(c);
    const teamId = getCurrentTeamId(c);
    if (!teamId || !user) {
      return error(c, ErrorCodes.UNAUTHORIZED, 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    // Only admins can remove
    if (user.role !== 'admin') {
      return error(c, ErrorCodes.FORBIDDEN, 'Only admins can remove members', HttpStatus.FORBIDDEN);
    }

    const memberId = c.req.param('memberId');

    // Cannot remove self
    if (memberId === user.userId) {
      return error(c, ErrorCodes.VALIDATION_ERROR, 'Cannot remove yourself', HttpStatus.BAD_REQUEST);
    }

    // Verify member is in same team
    const member = await c.env.DB.prepare(
      `SELECT id, role FROM users WHERE id = ? AND team_id = ?`
    ).bind(memberId, teamId).first();

    if (!member) {
      return error(c, ErrorCodes.NOT_FOUND, 'Member not found', HttpStatus.NOT_FOUND);
    }

    // Deactivate user
    await deactivateUser(c.env.DB, memberId);

    return success(c, { message: 'Member removed successfully' });
  } catch (err) {
    console.error('Remove member error:', err);
    return error(
      c,
      ErrorCodes.INTERNAL_ERROR,
      'Failed to remove member',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
});

// Helper: Generate temporary password
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  let password = '';
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 12; i++) {
    password += chars[randomValues[i]! % chars.length];
  }
  return password;
}

export default team;
