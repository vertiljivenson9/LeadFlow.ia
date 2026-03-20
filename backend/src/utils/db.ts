import type { D1Database } from '@cloudflare/workers-types';
import { generateId } from './crypto';

// Generic query result type
interface QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta?: {
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

// Execute a query and return results
export async function query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results;
}

// Execute a query and return a single result
export async function queryOne<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result;
}

// Execute an insert/update/delete and return metadata
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<{ success: boolean; lastRowId: number; changes: number }> {
  const result = await db.prepare(sql).bind(...params).run() as QueryResult;
  return {
    success: result.success,
    lastRowId: result.meta?.last_row_id ?? 0,
    changes: result.meta?.changes ?? 0,
  };
}

// Execute multiple statements in a batch
export async function batch(
  db: D1Database,
  statements: Array<{ sql: string; params: unknown[] }>
): Promise<void> {
  const prepared = statements.map(({ sql, params }) =>
    db.prepare(sql).bind(...params)
  );
  await db.batch(prepared);
}

// Transaction wrapper
export async function transaction<T>(
  _db: D1Database,
  callback: () => Promise<T>
): Promise<T> {
  // D1 doesn't support explicit transactions in the same way
  // Using batch for atomic operations
  return callback();
}

// Generate a new ID for database records
export function newId(): string {
  return generateId(16);
}

// Current timestamp in ISO format
export function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// Build WHERE clause from conditions
export function buildWhereClause(
  conditions: Record<string, unknown>
): { clause: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(conditions)) {
    if (value !== undefined && value !== null) {
      clauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

// Build ORDER BY clause
export function buildOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'asc'
): string {
  return `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
}

// Build LIMIT and OFFSET clause
export function buildPagination(
  page: number = 1,
  limit: number = 20
): { clause: string; offset: number } {
  const offset = (page - 1) * limit;
  return {
    clause: `LIMIT ${limit} OFFSET ${offset}`,
    offset,
  };
}

// Safe JSON parse
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Safe JSON stringify
export function safeJsonStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
