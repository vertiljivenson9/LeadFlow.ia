import { Mail, Phone, Building, GripVertical, ChevronRight } from 'lucide-react';
import type { Lead, LeadStage } from '../types';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
  onStageChange?: (stage: LeadStage) => void;
  showStageActions?: boolean;
  showDragHandle?: boolean;
}

const stageColors: Record<LeadStage, { bg: string; text: string; border: string }> = {
  new: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  contacted: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  interested: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  closed: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const sourceIcons: Record<string, string> = {
  website: 'Globe',
  referral: 'Users',
  social: 'Share2',
  email: 'Mail',
  phone: 'Phone',
  event: 'Calendar',
  manual: 'Edit',
  other: 'MoreHorizontal',
};

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600 bg-green-50';
  if (score >= 40) return 'text-orange-600 bg-orange-50';
  return 'text-red-600 bg-red-50';
}

export default function LeadCard({ 
  lead, 
  onClick, 
  onStageChange,
  showStageActions = false,
  showDragHandle = false,
}: LeadCardProps) {
  const colors = stageColors[lead.stage];

  return (
    <div
      className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-gray-200 transition-all ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle for desktop */}
        {showDragHandle && (
          <div className="text-gray-300 cursor-grab active:cursor-grabbing pt-1">
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header: Name + Score */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{lead.name}</h3>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${getScoreColor(lead.score)}`}>
              {lead.score}
            </span>
          </div>

          {/* Contact info */}
          <div className="space-y-1 text-sm text-gray-500">
            {lead.company && (
              <div className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{lead.company}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{lead.phone}</span>
              </div>
            )}
          </div>

          {/* Footer: Source + Stage + Date */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 capitalize">{lead.source}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                {lead.stage}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(lead.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Stage change buttons (mobile) */}
          {showStageActions && onStageChange && (
            <div className="flex gap-1 mt-2 pt-2 border-t border-gray-50">
              {(['new', 'contacted', 'interested', 'closed'] as LeadStage[]).map((stage) => (
                <button
                  key={stage}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStageChange(stage);
                  }}
                  disabled={lead.stage === stage}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    lead.stage === stage
                      ? `${stageColors[stage].bg} ${stageColors[stage].text} font-medium`
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {stage.charAt(0).toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Arrow indicator */}
        {onClick && !showStageActions && (
          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}
