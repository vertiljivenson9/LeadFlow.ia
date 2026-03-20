// Cloudflare Worker Environment Bindings
export interface Env {
  // D1 Database (SQLite)
  DB: D1Database;

  // KV Namespace (caching, tokens)
  KV: KVNamespace;

  // R2 Bucket (file exports)
  R2: R2Bucket;

  // Queue (OPTIONAL - only if using Cloudflare Queues paid plan)
  // Comment out if not using queues - we use Cron Triggers instead (free)
  QUEUE?: Queue<QueueMessage>;

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  RESEND_API_KEY: string;

  // Environment variables
  RATE_LIMIT_REQUESTS: string;
  RATE_LIMIT_WINDOW: string;
  ENVIRONMENT: string;
}

// Lead source types
export type LeadSource = 'website' | 'referral' | 'social' | 'email' | 'phone' | 'event' | 'manual' | 'other';

// Lead stage types
export type LeadStage = 'new' | 'contacted' | 'interested' | 'closed';

// Activity type
export type ActivityType = 'created' | 'stage_change' | 'note_added' | 'email_sent' | 'follow_up' | 'score_updated' | 'exported';

// Queue message types (for optional Cloudflare Queues)
export interface QueueMessage {
  type: 'send_follow_up' | 'send_email' | 'score_update' | 'export';
  teamId: string;
  leadId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// Database entity types
export interface Team {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'member';
  team_id: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  team_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  stage: LeadStage;
  score: number;
  notes: string | null;
  custom_fields: string | null;
  assigned_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  closed_at: string | null;
}

export interface Activity {
  id: string;
  lead_id: string;
  team_id: string;
  user_id: string | null;
  type: ActivityType;
  description: string;
  metadata: string | null;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  team_id: string;
  name: string;
  subject: string;
  body: string;
  variables: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  team_id: string;
  lead_id: string | null;
  template_id: string | null;
  recipient_email: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  external_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface DashboardCache {
  id: string;
  team_id: string;
  cache_data: string;
  computed_at: string;
  expires_at: string;
}

export interface QueueJob {
  id: string;
  team_id: string;
  job_type: string;
  payload: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// JWT payload types
export interface JwtPayload {
  userId: string;
  teamId: string;
  role: 'admin' | 'member';
  email: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat: number;
  exp: number;
}
