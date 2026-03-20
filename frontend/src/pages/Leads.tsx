import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePipeline, useCreateLead, useUpdateLeadStage } from '../lib/queries';
import { useAuth } from '../contexts/AuthContext';
import MobileLayout from '../components/MobileLayout';
import LeadCard from '../components/LeadCard';
import LeadFormModal from '../components/LeadFormModal';
import { Plus, Filter, ChevronDown, GripVertical } from 'lucide-react';
import type { LeadStage, Lead } from '../types';

const STAGES: { value: LeadStage; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'contacted', label: 'Contacted', color: 'bg-orange-500' },
  { value: 'interested', label: 'Interested', color: 'bg-green-500' },
  { value: 'closed', label: 'Closed', color: 'bg-purple-500' },
];

export default function Leads() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [activeStage, setActiveStage] = useState<LeadStage | null>(null);

  const { data: pipeline, isLoading, error, refetch } = usePipeline();
  const createLead = useCreateLead();
  const updateStage = useUpdateLeadStage();

  const handleCreateLead = async (data: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    source?: string;
    notes?: string;
  }) => {
    try {
      await createLead.mutateAsync(data);
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Failed to create lead:', error);
    }
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(null);

    if (draggedLead && draggedLead.stage !== targetStage) {
      try {
        await updateStage.mutateAsync({
          id: draggedLead.id,
          stage: targetStage,
        });
      } catch (error) {
        console.error('Failed to update stage:', error);
      }
    }
    setDraggedLead(null);
  };

  const handleLeadClick = (leadId: string) => {
    navigate(`/leads/${leadId}`);
  };

  // Handle stage change for mobile (tap)
  const handleStageChange = async (leadId: string, newStage: LeadStage) => {
    try {
      await updateStage.mutateAsync({
        id: leadId,
        stage: newStage,
      });
    } catch (error) {
      console.error('Failed to update stage:', error);
    }
  };

  if (error) {
    return (
      <MobileLayout title="Leads">
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p className="font-medium">Error loading leads</p>
            <button 
              onClick={() => refetch()}
              className="text-sm mt-2 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Leads">
      {/* Header with filter button */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Pipeline</h1>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Lead</span>
          </button>
        </div>
      </div>

      {/* Mobile: Vertical stack of stages */}
      <div className="sm:hidden p-4 space-y-6">
        {isLoading ? (
          // Loading skeletons
          STAGES.map((stage) => (
            <div key={stage.value}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
              </div>
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          STAGES.map((stage) => {
            const stageData = pipeline?.stages.find((s) => s.name === stage.value);
            const leads = stageData?.leads || [];

            return (
              <div key={stage.value}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                    <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {leads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {leads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => handleLeadClick(lead.id)}
                      onStageChange={(newStage) => handleStageChange(lead.id, newStage)}
                      showStageActions
                    />
                  ))}
                  {leads.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                      No leads
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: Kanban columns */}
      <div className="hidden sm:block p-4">
        <div className="grid grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const stageData = pipeline?.stages.find((s) => s.name === stage.value);
            const leads = stageData?.leads || [];
            const isOver = dragOverStage === stage.value;

            return (
              <div
                key={stage.value}
                className={`bg-gray-50 rounded-lg p-3 min-h-[400px] transition-colors ${
                  isOver ? 'bg-primary-50 ring-2 ring-primary-200' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, stage.value)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.value)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                    <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full shadow-sm">
                    {leads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {isLoading ? (
                    // Loading skeletons
                    [1, 2].map((i) => (
                      <div key={i} className="bg-white rounded-lg p-3 shadow-sm animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    ))
                  ) : (
                    leads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onClick={() => handleLeadClick(lead.id)}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <LeadCard lead={lead} showDragHandle />
                      </div>
                    ))
                  )}
                  {!isLoading && leads.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Drag leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && pipeline && pipeline.stages.every((s) => s.leads.length === 0) && (
        <div className="text-center py-12 px-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 mb-2">No leads yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Create your first lead to start building your pipeline
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Lead
          </button>
        </div>
      )}

      {/* Floating action button (mobile) */}
      <button
        onClick={() => setIsCreateModalOpen(true)}
        className="sm:hidden fixed right-4 bottom-20 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg 
                   flex items-center justify-center hover:bg-primary-700 active:bg-primary-800
                   transition-colors duration-200 z-20"
        aria-label="Add lead"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Create lead modal */}
      <LeadFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateLead}
        isLoading={createLead.isPending}
      />
    </MobileLayout>
  );
}
