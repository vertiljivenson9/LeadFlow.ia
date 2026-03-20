import { useParams, useNavigate } from 'react-router-dom';
import { useLead, useActivities, useUpdateLeadStage, useAddNote, useDeleteLead } from '../lib/queries';
import MobileLayout from '../components/MobileLayout';
import LeadFormModal from '../components/LeadFormModal';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Building, 
  Calendar,
  Clock,
  Edit,
  Trash2,
  MessageSquare,
  Send,
  ChevronDown,
  User,
  MoreVertical,
  X
} from 'lucide-react';
import { useState } from 'react';
import type { LeadStage } from '../types';

const stageColors: Record<LeadStage, { bg: string; text: string; border: string }> = {
  new: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  contacted: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  interested: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  closed: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Calendar,
  stage_change: ChevronDown,
  note_added: MessageSquare,
  email_sent: Send,
  follow_up: Clock,
  score_updated: User,
  exported: Send,
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [note, setNote] = useState('');

  const { data: lead, isLoading, error } = useLead(id!);
  const { data: activitiesData } = useActivities(id!);
  const updateStage = useUpdateLeadStage();
  const addNote = useAddNote();
  const deleteLead = useDeleteLead();

  const handleStageChange = async (stage: LeadStage) => {
    if (id) {
      await updateStage.mutateAsync({ id, stage });
      setShowStageMenu(false);
    }
  };

  const handleAddNote = async () => {
    if (id && note.trim()) {
      await addNote.mutateAsync({ leadId: id, note: note.trim() });
      setNote('');
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteLead.mutateAsync(id);
      navigate('/leads');
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="Lead Detail" showBack>
        <div className="p-4 space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </MobileLayout>
    );
  }

  if (error || !lead) {
    return (
      <MobileLayout title="Lead Detail" showBack>
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p className="font-medium">Lead not found</p>
            <button 
              onClick={() => navigate('/leads')}
              className="text-sm mt-2 underline hover:no-underline"
            >
              Back to leads
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  const colors = stageColors[lead.stage];
  const activities = activitiesData?.data || [];

  return (
    <MobileLayout title="Lead Detail" showBack>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/leads')}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{lead.name}</h1>
              {lead.company && (
                <p className="text-sm text-gray-500">{lead.company}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Score and Stage */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Score</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    lead.score >= 70 ? 'bg-green-500' :
                    lead.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${lead.score}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900">{lead.score}</span>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowStageMenu(!showStageMenu)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${colors.bg} ${colors.text} border ${colors.border} flex items-center gap-1`}
            >
              {lead.stage}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showStageMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10"
                  onClick={() => setShowStageMenu(false)}
                />
                <div className="absolute right-0 mt-1 py-1 bg-white rounded-lg shadow-lg border border-gray-100 z-20 min-w-[120px]">
                  {(['new', 'contacted', 'interested', 'closed'] as LeadStage[]).map((stage) => (
                    <button
                      key={stage}
                      onClick={() => handleStageChange(stage)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        lead.stage === stage ? 'font-medium' : ''
                      }`}
                    >
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg border border-gray-100 divide-y divide-gray-100">
          {lead.email && (
            <a 
              href={`mailto:${lead.email}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <Mail className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{lead.email}</span>
            </a>
          )}
          {lead.phone && (
            <a 
              href={`tel:${lead.phone}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <Phone className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{lead.phone}</span>
            </a>
          )}
          <div className="flex items-center gap-3 px-4 py-3">
            <Building className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-gray-900">{lead.company || 'No company'}</p>
              <p className="text-xs text-gray-500">Source: {lead.source}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {lead.notes && (
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
            <p className="text-gray-600 text-sm whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}

        {/* Add Note */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Add Note</h3>
          <div className="flex gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write a note..."
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none resize-none text-sm"
            />
            <button
              onClick={handleAddNote}
              disabled={!note.trim() || addNote.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addNote.isPending ? '...' : 'Add'}
            </button>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Activity Timeline</h3>
          {activities.length > 0 ? (
            <div className="space-y-4">
              {activities.map((activity, index) => {
                const Icon = activityIcons[activity.type] || Clock;
                return (
                  <div key={activity.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-500" />
                      </div>
                      {index < activities.length - 1 && (
                        <div className="w-0.5 flex-1 bg-gray-100 my-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-4">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
          )}
        </div>

        {/* Dates */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>Created: {new Date(lead.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(lead.updatedAt).toLocaleString()}</p>
          {lead.lastContactedAt && (
            <p>Last contacted: {new Date(lead.lastContactedAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <LeadFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={async (data) => {
          // Handle edit
          setIsEditModalOpen(false);
        }}
        isLoading={false}
        initialData={lead}
        mode="edit"
      />

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Lead?</h3>
            <p className="text-gray-500 mb-4">This action cannot be undone. All data associated with this lead will be permanently deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLead.isPending}
                className="flex-1 py-2 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLead.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
