import React, { useState, useEffect, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ================================================
// TYPES
// ================================================
interface User {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  value?: number;
  stage: string;
  source?: string;
  notes?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

// ================================================
// API CLIENT
// ================================================
const API_BASE = '/api';

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Error');
  return data.data;
}

// ================================================
// AUTH CONTEXT
// ================================================
const AuthContext = createContext<AuthContextType | null>(null);

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      apiFetch('/auth/me').then(data => setUser(data.user)).catch(() => {
        localStorage.removeItem('token');
        setToken(null);
      });
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', data.accessToken);
    setToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (data: RegisterData) => {
    const result = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    localStorage.setItem('token', result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ================================================
// PAGES
// ================================================

// Login Page
function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            LeadFlow AI
          </h1>
          <p className="text-gray-500 mt-2">Inicia sesión en tu cuenta</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        
        <p className="text-center mt-6 text-gray-500">
          ¿No tienes cuenta? <a href="/register" className="text-blue-500 hover:underline">Regístrate</a>
        </p>
      </div>
    </div>
  );
}

// Register Page
function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '', organizationName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(form);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            Crear Cuenta
          </h1>
          <p className="text-gray-500 mt-2">Comienza gratis hoy</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Nombre completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Contraseña (mín. 6 caracteres)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input"
            required
            minLength={6}
          />
          <input
            type="text"
            placeholder="Nombre de organización (opcional)"
            value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            className="input"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </form>
        
        <p className="text-center mt-6 text-gray-500">
          ¿Ya tienes cuenta? <a href="/login" className="text-blue-500 hover:underline">Inicia sesión</a>
        </p>
      </div>
    </div>
  );
}

// Dashboard Page
function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch('/dashboard/stats'),
  });

  if (isLoading) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-gray-500 text-sm">Total Leads</p>
          <p className="text-3xl font-bold">{stats?.totalLeads || 0}</p>
        </div>
        <div className="card">
          <p className="text-gray-500 text-sm">Ganados</p>
          <p className="text-3xl font-bold text-green-600">{stats?.wonLeads || 0}</p>
        </div>
        <div className="card">
          <p className="text-gray-500 text-sm">Conversión</p>
          <p className="text-3xl font-bold text-blue-600">{stats?.conversionRate || 0}%</p>
        </div>
        <div className="card">
          <p className="text-gray-500 text-sm">Pipeline</p>
          <p className="text-3xl font-bold text-purple-600">${(stats?.pipelineValue || 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// Leads Kanban Page
function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => apiFetch('/pipeline'),
  });
  
  const [showModal, setShowModal] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', value: '', stage: 'new' });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch('/leads', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setShowModal(false);
      setNewLead({ name: '', email: '', company: '', value: '', stage: 'new' });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiFetch(`/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  if (isLoading) return <div className="p-8 text-center">Cargando...</div>;

  const stages = [
    { id: 'new', name: 'Nuevo', color: 'bg-blue-100 border-blue-300' },
    { id: 'contacted', name: 'Contactado', color: 'bg-yellow-100 border-yellow-300' },
    { id: 'qualified', name: 'Calificado', color: 'bg-purple-100 border-purple-300' },
    { id: 'proposal', name: 'Propuesta', color: 'bg-orange-100 border-orange-300' },
    { id: 'won', name: 'Ganado', color: 'bg-green-100 border-green-300' },
    { id: 'lost', name: 'Perdido', color: 'bg-red-100 border-red-300' },
  ];

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...newLead,
      value: parseFloat(newLead.value) || 0,
    });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          + Nuevo Lead
        </button>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageData = pipeline?.pipeline?.find((s: any) => s.stage === stage.id) || { count: 0, leads: [] };
          
          return (
            <div key={stage.id} className={`stage-column ${stage.color} border-2`}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">{stage.name}</h3>
                <span className="bg-white px-2 py-1 rounded-full text-sm font-medium">
                  {stageData.count}
                </span>
              </div>
              
              <div className="space-y-2">
                {/* Aquí irían los leads de cada etapa */}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Modal Crear Lead */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Nuevo Lead</h2>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <input
                type="text"
                placeholder="Nombre *"
                value={newLead.name}
                onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                className="input"
                required
              />
              <input
                type="email"
                placeholder="Email *"
                value={newLead.email}
                onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                className="input"
                required
              />
              <input
                type="text"
                placeholder="Empresa"
                value={newLead.company}
                onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                className="input"
              />
              <input
                type="number"
                placeholder="Valor estimado ($)"
                value={newLead.value}
                onChange={(e) => setNewLead({ ...newLead, value: e.target.value })}
                className="input"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Settings Page
function SettingsPage() {
  const { user, logout } = useAuth();
  
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>
      
      <div className="card max-w-md">
        <div className="space-y-4">
          <div>
            <p className="text-gray-500 text-sm">Nombre</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Email</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Rol</p>
            <p className="font-medium capitalize">{user?.role}</p>
          </div>
          <hr />
          <button onClick={logout} className="btn bg-red-100 text-red-600 hover:bg-red-200 w-full">
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Layout
function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-40">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          LeadFlow AI
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-600 text-sm hidden md:block">{user?.name}</span>
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1">
        {currentPage === 'dashboard' && <DashboardPage />}
        {currentPage === 'leads' && <LeadsPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>
      
      {/* Bottom Navigation (Mobile) */}
      <nav className="bg-white border-t flex justify-around py-2 md:hidden">
        <button onClick={() => setCurrentPage('dashboard')} className={`flex flex-col items-center p-2 ${currentPage === 'dashboard' ? 'text-blue-600' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="text-xs">Dashboard</span>
        </button>
        <button onClick={() => setCurrentPage('leads')} className={`flex flex-col items-center p-2 ${currentPage === 'leads' ? 'text-blue-600' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs">Leads</span>
        </button>
        <button onClick={() => setCurrentPage('settings')} className={`flex flex-col items-center p-2 ${currentPage === 'settings' ? 'text-blue-600' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs">Ajustes</span>
        </button>
      </nav>
    </div>
  );
}

// ================================================
// MAIN APP
// ================================================
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } }
});

export default function App() {
  const [page, setPage] = useState(window.location.pathname);
  
  useEffect(() => {
    const handlePopState = () => setPage(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setPage(path);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router page={page} navigate={navigate} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Router({ page, navigate }: { page: string; navigate: (path: string) => void }) {
  const { user, token } = useAuth();
  
  // Check auth
  useEffect(() => {
    const publicPages = ['/login', '/register'];
    if (!token && !publicPages.includes(page)) {
      navigate('/login');
    }
    if (token && publicPages.includes(page)) {
      navigate('/');
    }
  }, [token, page]);

  // Public routes
  if (page === '/login') return <LoginPage />;
  if (page === '/register') return <RegisterPage />;
  
  // Protected routes
  if (!user) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  
  return <Layout />;
}
