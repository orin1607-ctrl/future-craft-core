import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import type { AuthSessionPayload } from '@/lib/authOtpClient';
import { applyAuthSession } from '@/lib/authOtpClient';

export type AppRole = 'driver' | 'fleet_manager' | 'super_admin' | 'private_customer' | 'business_customer';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  company_name: string;
  is_active: boolean;
  role: AppRole;
}

interface AuthContextType {
  user: UserProfile | null;
  realUser: UserProfile | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  signup: (email: string, password: string, metadata: { full_name: string; phone: string; company_name: string; role?: AppRole }) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  completeLoginSession: (session: AuthSessionPayload) => Promise<{ error: string | null }>;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonate: (targetUser: UserProfile) => void;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

async function fetchUserProfile(userId: string, email: string, retries = 3): Promise<UserProfile | null> {
  for (let i = 0; i < retries; i++) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.error('Failed to fetch profile:', profileError);
      return null;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    return {
      id: userId,
      email,
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      company_name: profile.company_name || '',
      is_active: profile.is_active ?? true,
      role: (roleData?.role as AppRole) || 'driver',
    };
  }
  return null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [realUser, setRealUser] = useState<UserProfile | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const user = impersonatedUser || realUser;
  const isImpersonating = !!impersonatedUser;

  const loadProfile = useCallback(async (sess: Session | null) => {
    if (sess?.user) {
      const profile = await fetchUserProfile(sess.user.id, sess.user.email || '');
      setRealUser(profile);
      setSession(sess);
    } else {
      setRealUser(null);
      setSession(null);
      setImpersonatedUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setTimeout(() => loadProfile(newSession), 0);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      loadProfile(initialSession);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.session) {
      const profile = await fetchUserProfile(data.session.user.id, data.session.user.email || '');
      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        return { error: 'החשבון שלך ממתין לאישור מנהל. פנה למנהל המערכת.' };
      }
      setRealUser(profile);
      setSession(data.session);
    }
    return { error: null };
  };

  const signup = async (email: string, password: string, metadata: { full_name: string; phone: string; company_name: string; role?: AppRole }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    if (data.session) {
      await loadProfile(data.session);
    }
    return { error: null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setRealUser(null);
    setImpersonatedUser(null);
    setSession(null);
  };

  const impersonate = (targetUser: UserProfile) => {
    setImpersonatedUser(targetUser);
  };

  const stopImpersonation = () => {
    setImpersonatedUser(null);
  };

  const completeLoginSession = async (session: AuthSessionPayload) => {
    const { error } = await applyAuthSession(session);
    if (error) return { error };
    const userId = (session.user as { id?: string })?.id;
    const userEmail = (session.user as { email?: string })?.email || '';
    if (userId) {
      const profile = await fetchUserProfile(userId, userEmail);
      setRealUser(profile);
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
    }
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ user, realUser, session, loading, login, signup, logout, completeLoginSession, isAuthenticated: !!realUser, isImpersonating, impersonate, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};
