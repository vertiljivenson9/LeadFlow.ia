import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, pipelineApi, dashboardApi, teamApi } from '../lib/api';
import type { CreateLeadInput, UpdateLeadInput, LeadStage } from '../types';

// Query keys
export const queryKeys = {
  leads: (params?: Record<string, unknown>) => ['leads', params] as const,
  lead: (id: string) => ['lead', id] as const,
  pipeline: () => ['pipeline'] as const,
  dashboard: () => ['dashboard'] as const,
  team: () => ['team'] as const,
  teamMembers: () => ['team', 'members'] as const,
  activities: (leadId: string) => ['activities', leadId] as const,
};

// Leads queries
export function useLeads(params?: {
  stage?: LeadStage;
  source?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: queryKeys.leads(params),
    queryFn: async () => {
      const response = await leadsApi.list(params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch leads');
      }
      return response;
    },
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: queryKeys.lead(id),
    queryFn: async () => {
      const response = await leadsApi.get(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch lead');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function usePipeline() {
  return useQuery({
    queryKey: queryKeys.pipeline(),
    queryFn: async () => {
      const response = await pipelineApi.get();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pipeline');
      }
      return response.data;
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: async () => {
      const response = await dashboardApi.getStats();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch dashboard');
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useActivities(leadId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.activities(leadId),
    queryFn: async () => {
      const response = await leadsApi.getActivities(leadId, params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch activities');
      }
      return response;
    },
    enabled: !!leadId,
  });
}

// Leads mutations
export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateLeadInput) => {
      const response = await leadsApi.create(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create lead');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateLeadInput }) => {
      const response = await leadsApi.update(id, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update lead');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lead(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: LeadStage }) => {
      const response = await leadsApi.updateStage(id, stage);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update stage');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lead(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, note }: { leadId: string; note: string }) => {
      const response = await leadsApi.addNote(leadId, note);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add note');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lead(variables.leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities(variables.leadId) });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await leadsApi.delete(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete lead');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// Team queries
export function useTeam() {
  return useQuery({
    queryKey: queryKeys.team(),
    queryFn: async () => {
      const response = await teamApi.get();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch team');
      }
      return response.data;
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: queryKeys.teamMembers(),
    queryFn: async () => {
      const response = await teamApi.getMembers();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch team members');
      }
      return response.data;
    },
  });
}
