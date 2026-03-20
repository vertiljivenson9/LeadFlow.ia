import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { LeadStage } from '../types/env';
import { queryOne } from '../utils/db';

// Dashboard stats type
export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  interestedLeads: number;
  closedLeads: number;
  leadsToday: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  averageScore: number;
  conversionRate: number;
  bySource: Record<string, number>;
  byStage: Record<LeadStage, number>;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    leadName: string;
    createdAt: string;
  }>;
  scoreDistribution: {
    high: number; // 70-100
    medium: number; // 40-69
    low: number; // 0-39
  };
  computedAt: string;
}

// Cache key for dashboard
const CACHE_PREFIX = 'dashboard:';
const CACHE_TTL = 300; // 5 minutes

// Get cached dashboard stats
export async function getCachedDashboard(
  kv: KVNamespace,
  teamId: string
): Promise<DashboardStats | null> {
  const key = `${CACHE_PREFIX}${teamId}`;
  const cached = await kv.get(key);

  if (cached) {
    try {
      return JSON.parse(cached) as DashboardStats;
    } catch {
      return null;
    }
  }

  return null;
}

// Set cached dashboard stats
export async function setCachedDashboard(
  kv: KVNamespace,
  teamId: string,
  stats: DashboardStats
): Promise<void> {
  const key = `${CACHE_PREFIX}${teamId}`;
  await kv.put(key, JSON.stringify(stats), { expirationTtl: CACHE_TTL });
}

// Invalidate dashboard cache
export async function invalidateDashboardCache(
  kv: KVNamespace,
  teamId: string
): Promise<void> {
  const key = `${CACHE_PREFIX}${teamId}`;
  await kv.delete(key);
}

// Compute dashboard stats from database
export async function computeDashboardStats(
  db: D1Database,
  teamId: string
): Promise<DashboardStats> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Total leads
  const totalResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ?`
  ).bind(teamId).first<{ count: number }>();
  const totalLeads = totalResult?.count || 0;

  // Leads by stage
  const stages: LeadStage[] = ['new', 'contacted', 'interested', 'closed'];
  const byStage: Record<LeadStage, number> = {
    new: 0,
    contacted: 0,
    interested: 0,
    closed: 0,
  };

  for (const stage of stages) {
    const result = await db.prepare(
      `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND stage = ?`
    ).bind(teamId, stage).first<{ count: number }>();
    byStage[stage] = result?.count || 0;
  }

  // Leads today
  const todayResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND date(created_at) = ?`
  ).bind(teamId, today).first<{ count: number }>();
  const leadsToday = todayResult?.count || 0;

  // Leads this week
  const weekResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND created_at >= ?`
  ).bind(teamId, weekAgo).first<{ count: number }>();
  const leadsThisWeek = weekResult?.count || 0;

  // Leads this month
  const monthResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND created_at >= ?`
  ).bind(teamId, monthAgo).first<{ count: number }>();
  const leadsThisMonth = monthResult?.count || 0;

  // Average score
  const avgScoreResult = await db.prepare(
    `SELECT AVG(score) as avg FROM leads WHERE team_id = ?`
  ).bind(teamId).first<{ avg: number }>();
  const averageScore = Math.round(avgScoreResult?.avg || 0);

  // Conversion rate (closed / total)
  const conversionRate = totalLeads > 0 
    ? Math.round((byStage.closed / totalLeads) * 100) 
    : 0;

  // By source
  const sourceResults = await db.prepare(
    `SELECT source, COUNT(*) as count FROM leads WHERE team_id = ? GROUP BY source`
  ).bind(teamId).all<{ source: string; count: number }>();

  const bySource: Record<string, number> = {};
  for (const row of sourceResults.results) {
    bySource[row.source] = row.count;
  }

  // Score distribution
  const highScoreResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND score >= 70`
  ).bind(teamId).first<{ count: number }>();

  const mediumScoreResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND score >= 40 AND score < 70`
  ).bind(teamId).first<{ count: number }>();

  const lowScoreResult = await db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE team_id = ? AND score < 40`
  ).bind(teamId).first<{ count: number }>();

  // Recent activity
  const activityResults = await db.prepare(
    `SELECT a.id, a.type, a.description, a.created_at, l.name as lead_name
     FROM activities a
     LEFT JOIN leads l ON a.lead_id = l.id
     WHERE a.team_id = ?
     ORDER BY a.created_at DESC
     LIMIT 10`
  ).bind(teamId).all<{
    id: string;
    type: string;
    description: string;
    created_at: string;
    lead_name: string | null;
  }>();

  const recentActivity = activityResults.results.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    leadName: a.lead_name || 'Unknown',
    createdAt: a.created_at,
  }));

  return {
    totalLeads,
    newLeads: byStage.new,
    contactedLeads: byStage.contacted,
    interestedLeads: byStage.interested,
    closedLeads: byStage.closed,
    leadsToday,
    leadsThisWeek,
    leadsThisMonth,
    averageScore,
    conversionRate,
    bySource,
    byStage,
    recentActivity,
    scoreDistribution: {
      high: highScoreResult?.count || 0,
      medium: mediumScoreResult?.count || 0,
      low: lowScoreResult?.count || 0,
    },
    computedAt: now.toISOString(),
  };
}

// Get dashboard stats (with cache)
export async function getDashboardStats(
  db: D1Database,
  kv: KVNamespace,
  teamId: string,
  forceRefresh: boolean = false
): Promise<DashboardStats> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getCachedDashboard(kv, teamId);
    if (cached) {
      return cached;
    }
  }

  // Compute fresh stats
  const stats = await computeDashboardStats(db, teamId);

  // Cache the results
  await setCachedDashboard(kv, teamId, stats);

  return stats;
}
