import { z } from 'zod';

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  teamName: z.string().min(1, 'Team name is required').max(100),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// Lead schemas
export const leadSourceSchema = z.enum([
  'website',
  'referral',
  'social',
  'email',
  'phone',
  'event',
  'manual',
  'other',
]);

export const leadStageSchema = z.enum([
  'new',
  'contacted',
  'interested',
  'closed',
]);

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: leadSourceSchema.default('manual'),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: leadSourceSchema.optional(),
  stage: leadStageSchema.optional(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
});

export const updateLeadStageSchema = z.object({
  stage: leadStageSchema,
});

export const addNoteSchema = z.object({
  note: z.string().min(1, 'Note is required').max(5000),
});

// Activity schemas
export const activityTypeSchema = z.enum([
  'created',
  'stage_change',
  'note_added',
  'email_sent',
  'follow_up',
  'score_updated',
  'exported',
]);

// Query schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const leadsQuerySchema = paginationSchema.extend({
  stage: leadStageSchema.optional(),
  source: leadSourceSchema.optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['name', 'score', 'created_at', 'updated_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  assignedUserId: z.string().optional(),
});

export const activitiesQuerySchema = paginationSchema.extend({
  leadId: z.string().optional(),
  type: activityTypeSchema.optional(),
});

// Team schemas
export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']).default('member'),
});

// Export schemas
export const exportQuerySchema = z.object({
  stage: leadStageSchema.optional(),
  source: leadSourceSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Email template schemas
export const createEmailTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().min(1, 'Body is required').max(10000),
  variables: z.array(z.string()).optional(),
});

export const updateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(10000).optional(),
  variables: z.array(z.string()).optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type UpdateLeadStageInput = z.infer<typeof updateLeadStageSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type LeadsQueryInput = z.infer<typeof leadsQuerySchema>;
export type ActivitiesQueryInput = z.infer<typeof activitiesQuerySchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
