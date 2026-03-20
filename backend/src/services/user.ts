import type { D1Database } from '@cloudflare/workers-types';
import type { User, Team } from '../types/env';
import { queryOne, execute, newId, timestamp } from '../utils/db';
import { hashPassword } from '../utils/crypto';

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  teamName: string;
}

export interface UserWithTeam {
  user: User;
  team: Team;
}

// Create a new team
export async function createTeam(
  db: D1Database,
  name: string
): Promise<Team> {
  const id = newId();
  const slug = generateSlug(name);
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO teams (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, slug, now, now]
  );

  return {
    id,
    name,
    slug,
    created_at: now,
    updated_at: now,
  };
}

// Create a new user
export async function createUser(
  db: D1Database,
  data: CreateUserData
): Promise<UserWithTeam> {
  // Create team first
  const team = await createTeam(db, data.teamName);
  
  // Hash password
  const passwordHash = await hashPassword(data.password);
  
  // Create user
  const userId = newId();
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, team_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, 'admin', team.id, 1, now, now]
  );

  const user: User = {
    id: userId,
    email: data.email.toLowerCase(),
    password_hash: passwordHash,
    first_name: data.firstName,
    last_name: data.lastName,
    role: 'admin',
    team_id: team.id,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };

  return { user, team };
}

// Find user by email
export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<User | null> {
  return queryOne<User>(
    db,
    `SELECT * FROM users WHERE email = ? AND is_active = 1`,
    [email.toLowerCase()]
  );
}

// Find user by ID
export async function findUserById(
  db: D1Database,
  id: string
): Promise<User | null> {
  return queryOne<User>(
    db,
    `SELECT * FROM users WHERE id = ? AND is_active = 1`,
    [id]
  );
}

// Find team by ID
export async function findTeamById(
  db: D1Database,
  id: string
): Promise<Team | null> {
  return queryOne<Team>(
    db,
    `SELECT * FROM teams WHERE id = ?`,
    [id]
  );
}

// Update user
export async function updateUser(
  db: D1Database,
  userId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    passwordHash: string;
  }>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.firstName !== undefined) {
    updates.push('first_name = ?');
    params.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    updates.push('last_name = ?');
    params.push(data.lastName);
  }
  if (data.passwordHash !== undefined) {
    updates.push('password_hash = ?');
    params.push(data.passwordHash);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  params.push(timestamp());
  params.push(userId);

  await execute(
    db,
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

// Check if email exists
export async function emailExists(
  db: D1Database,
  email: string
): Promise<boolean> {
  const user = await queryOne<{ id: string }>(
    db,
    `SELECT id FROM users WHERE email = ?`,
    [email.toLowerCase()]
  );
  return user !== null;
}

// Generate a URL-safe slug from team name
function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${baseSlug}-${randomSuffix}`;
}

// Get team members
export async function getTeamMembers(
  db: D1Database,
  teamId: string
): Promise<Omit<User, 'password_hash'>[]> {
  const results = await db.prepare(
    `SELECT id, email, first_name, last_name, role, team_id, is_active, created_at, updated_at 
     FROM users WHERE team_id = ? AND is_active = 1 ORDER BY created_at ASC`
  ).bind(teamId).all<Omit<User, 'password_hash'>>();
  
  return results.results;
}

// Add team member
export async function addTeamMember(
  db: D1Database,
  teamId: string,
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'member';
  }
): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  const userId = newId();
  const now = timestamp();

  await execute(
    db,
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, team_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.role, teamId, 1, now, now]
  );

  return {
    id: userId,
    email: data.email.toLowerCase(),
    password_hash: passwordHash,
    first_name: data.firstName,
    last_name: data.lastName,
    role: data.role,
    team_id: teamId,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };
}

// Deactivate user
export async function deactivateUser(
  db: D1Database,
  userId: string
): Promise<void> {
  await execute(
    db,
    `UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?`,
    [timestamp(), userId]
  );
}
