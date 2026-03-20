import { useAuth } from '../contexts/AuthContext';
import { useTeam, useTeamMembers } from '../lib/queries';
import MobileLayout from '../components/MobileLayout';
import { 
  Building2, 
  Users, 
  User, 
  Shield,
  Mail,
  Calendar
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { data: team } = useTeam();
  const { data: members } = useTeamMembers();

  return (
    <MobileLayout title="Settings">
      <div className="p-4 space-y-6">
        {/* Profile Section */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Profile</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-semibold text-primary-700">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600 capitalize">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Team Section */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Team</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">{team?.name}</p>
                <p className="text-xs text-gray-500">{team?.slug}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Members</h2>
              <span className="text-xs text-gray-400">{members?.length || 0} members</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {members?.map((member) => (
              <div key={member.id} className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">
                    {member.firstName?.[0]}{member.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  member.role === 'admin' 
                    ? 'bg-primary-50 text-primary-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* App Info */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">About</h2>
          </div>
          <div className="p-4 space-y-3 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Version</span>
              <span className="text-gray-400">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Build</span>
              <span className="text-gray-400">Production</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-4">
          <p>LeadFlow AI - Mobile-First CRM</p>
          <p className="mt-1">Built for small businesses</p>
        </div>
      </div>
    </MobileLayout>
  );
}
