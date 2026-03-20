import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, api } from '../lib/api';
import type { User, Team } from '../types';

interface AuthContextType {
  user: User | null;
  team: Team | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    teamName: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      if (response.success && response.data) {
        setUser(response.data.user);
        setTeam(response.data.team);
      } else {
        setUser(null);
        setTeam(null);
        api.setAccessToken(null);
      }
    } catch {
      setUser(null);
      setTeam(null);
      api.setAccessToken(null);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        api.setAccessToken(token);
        await refreshUser();
      }
      setIsLoading(false);
    };
    initAuth();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password });
      if (response.success && response.data) {
        const { user: userData, team: teamData, tokens } = response.data;
        setUser(userData);
        setTeam(teamData);
        api.setAccessToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Login failed' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    teamName: string;
  }) => {
    try {
      const response = await authApi.register(data);
      if (response.success && response.data) {
        const { user: userData, team: teamData, tokens } = response.data;
        setUser(userData);
        setTeam(teamData);
        api.setAccessToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        return { success: true };
      }
      return { success: false, error: response.error?.message || 'Registration failed' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      setUser(null);
      setTeam(null);
      api.setAccessToken(null);
      localStorage.removeItem('refreshToken');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        team,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
