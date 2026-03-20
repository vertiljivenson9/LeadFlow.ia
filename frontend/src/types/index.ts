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

// User types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'member';
  teamId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

// Lead types
export type LeadSource =
  | 'website'
  | 'referral'
  | 'social'
  | 'email'
  | 'phone'
  | 'event'
  | 'manual'
  | 'other';

export type LeadStage = 'new' | 'contacted' | 'interested' | 'closed';

export interface Lead {
  id: string;
  teamId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  stage: LeadStage;
  score: number;
  notes: string | null;
  customFields: Record<string, unknown> | null;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastContactedAt: string | null;
  closedAt: string | null;
}

export interface CreateLeadInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: LeadSource;
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
  assignedUserId?: string | null;
}

export interface UpdateLeadInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: LeadSource;
  stage?: LeadStage;
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
  assignedUserId?: string | null;
}

// Activity types
export type ActivityType =
  | 'created'
  | 'stage_change'
  | 'note_added'
  | 'email_sent'
  | 'follow_up'
  | 'score_updated'
  | 'exported';

export interface Activity {
  id: string;
  leadId: string;
  teamId: string;
  userId: string | null;
  type: ActivityType;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// Dashboard types
export interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  leadsInProgress: number;
  closedLeads: number;
  conversionRate: number;
  leadsByStage: Record<LeadStage, number>;
  leadsBySource: Record<LeadSource, number>;
  recentActivity: Activity[];
}

// Pipeline types
export interface Pipeline {
  stages: {
    name: LeadStage;
    count: number;
    leads: Lead[];
  }[];
}

// Auth types
export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  teamName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  team: Team;
  tokens: AuthTokens;
}

// Query types
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface LeadsQueryParams extends PaginationParams {
  stage?: LeadStage;
  source?: LeadSource;
  search?: string;
  sortBy?: 'name' | 'score' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  assignedUserId?: string;
}

// Export types
export interface ExportParams {
  stage?: LeadStage;
  source?: LeadSource;
  startDate?: string;
  endDate?: string;
}

export interface ExportResponse {
  downloadUrl: string;
  expiresAt: string;
  count: number;
}
