import { useDashboard } from '../lib/queries';
import { useAuth } from '../contexts/AuthContext';
import MobileLayout from '../components/MobileLayout';
import { 
  Users, 
  UserPlus, 
  TrendingUp, 
  CheckCircle, 
  Clock,
  Target,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export default function Dashboard() {
  const { team } = useAuth();
  const { data: stats, isLoading, error } = useDashboard();

  if (error) {
    return (
      <MobileLayout title="Dashboard">
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p className="font-medium">Error loading dashboard</p>
            <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  const statCards = [
    {
      label: 'Total Leads',
      value: stats?.totalLeads ?? 0,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'New Today',
      value: stats?.leadsToday ?? 0,
      icon: UserPlus,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'In Progress',
      value: (stats?.contactedLeads ?? 0) + (stats?.interestedLeads ?? 0),
      icon: Clock,
      color: 'bg-orange-50 text-orange-600',
    },
    {
      label: 'Closed',
      value: stats?.closedLeads ?? 0,
      icon: CheckCircle,
      color: 'bg-purple-50 text-purple-600',
    },
  ];

  const stageColors: Record<string, string> = {
    new: 'bg-blue-500',
    contacted: 'bg-orange-500',
    interested: 'bg-green-500',
    closed: 'bg-purple-500',
  };

  return (
    <MobileLayout title="Dashboard">
      <div className="p-4 space-y-6">
        {/* Team header */}
        {team && (
          <div className="mb-2">
            <h2 className="text-lg font-semibold text-gray-900">{team.name}</h2>
            <p className="text-sm text-gray-500">Welcome back!</p>
          </div>
        )}

        {/* Stats grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-12"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{stat.label}</span>
                  <div className={`p-1.5 rounded-lg ${stat.color}`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Conversion rate */}
        {!isLoading && stats && (
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-gray-900">Conversion Rate</span>
              </div>
              <div className={`flex items-center gap-1 text-sm ${stats.conversionRate >= 20 ? 'text-green-600' : 'text-orange-600'}`}>
                {stats.conversionRate >= 20 ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {stats.conversionRate}%
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats.conversionRate, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Pipeline overview */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-4">Pipeline Overview</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex items-center justify-between">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-8"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {['new', 'contacted', 'interested', 'closed'].map((stage) => {
                const count = stats?.byStage?.[stage as keyof typeof stats.byStage] ?? 0;
                const label = stage.charAt(0).toUpperCase() + stage.slice(1);
                return (
                  <div key={stage} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${stageColors[stage]}`} />
                      <span className="text-sm text-gray-600">{label}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Score distribution */}
        {!isLoading && stats && (
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <h3 className="font-medium text-gray-900 mb-4">Lead Scores</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-center">
                <div className="h-16 bg-gray-100 rounded-lg flex items-end justify-center pb-1 mb-1">
                  <div 
                    className="w-8 bg-green-500 rounded-t transition-all duration-500"
                    style={{ height: `${stats.scoreDistribution.high > 0 ? Math.max(20, (stats.scoreDistribution.high / stats.totalLeads) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">High</p>
                <p className="text-sm font-medium text-gray-900">{stats.scoreDistribution.high}</p>
              </div>
              <div className="flex-1 text-center">
                <div className="h-16 bg-gray-100 rounded-lg flex items-end justify-center pb-1 mb-1">
                  <div 
                    className="w-8 bg-orange-500 rounded-t transition-all duration-500"
                    style={{ height: `${stats.scoreDistribution.medium > 0 ? Math.max(20, (stats.scoreDistribution.medium / stats.totalLeads) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">Medium</p>
                <p className="text-sm font-medium text-gray-900">{stats.scoreDistribution.medium}</p>
              </div>
              <div className="flex-1 text-center">
                <div className="h-16 bg-gray-100 rounded-lg flex items-end justify-center pb-1 mb-1">
                  <div 
                    className="w-8 bg-red-500 rounded-t transition-all duration-500"
                    style={{ height: `${stats.scoreDistribution.low > 0 ? Math.max(20, (stats.scoreDistribution.low / stats.totalLeads) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">Low</p>
                <p className="text-sm font-medium text-gray-900">{stats.scoreDistribution.low}</p>
              </div>
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-4">Recent Activity</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                    activity.type === 'created' ? 'bg-blue-500' :
                    activity.type === 'stage_change' ? 'bg-orange-500' :
                    activity.type === 'email_sent' ? 'bg-green-500' :
                    'bg-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{activity.description}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <p className="text-sm">No recent activity</p>
              <p className="text-xs mt-1">Create your first lead to get started</p>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
