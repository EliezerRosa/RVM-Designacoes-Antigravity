import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'publicador';
  phone: string | null;
  whatsapp_verified: boolean;
  publisher_id: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  needs2FA: boolean;
}

interface AuthContextType extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  requestWhatsAppCode: (phone: string) => Promise<{ success?: boolean; error?: string }>;
  verifyWhatsAppCode: (code: string) => Promise<{ success?: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  logTransaction: (action: string, entityType: string, entityId?: string, description?: string, oldData?: unknown, newData?: unknown) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function logAuthEvent(
  profileId: string | null,
  email: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('auth_logs').insert({
      profile_id: profileId,
      email,
      event_type: eventType,
      user_agent: navigator.userAgent,
      metadata,
    });
  } catch (e) {
    console.warn('[AuthLog] Failed to log event:', e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    needs2FA: false,
  });

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Error fetching profile:', error.message, error.code, error.hint, JSON.stringify(error));
      return null;
    }
    console.log('[Auth] Profile fetched:', data ? `${data.email} (${data.role})` : 'NULL');
    return data as Profile | null;
  }, []);

  const updateState = useCallback((user: User | null, session: Session | null, profile: Profile | null) => {
    const isAdmin = profile?.role === 'admin';
    const needs2FA = !!user && !!profile && !profile.whatsapp_verified && !isAdmin;

    console.log('[Auth] updateState:', { 
      hasUser: !!user, hasProfile: !!profile, isAdmin, needs2FA, 
      isAuthenticated: !!user && !!profile && (profile?.whatsapp_verified || isAdmin),
      email: user?.email 
    });

    setState({
      user,
      session,
      profile,
      isLoading: false,
      isAuthenticated: !!user && !!profile && (profile.whatsapp_verified || isAdmin),
      isAdmin,
      needs2FA,
    });
  }, []);

  // Initialize session — rely on onAuthStateChange for all events
  useEffect(() => {
    let mounted = true;

    // Safety timeout: if still loading after 5s, force show login
    const timeout = setTimeout(() => {
      if (mounted && state.isLoading) {
        console.warn('[Auth] Safety timeout - forcing loading to false');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      console.log('[Auth] onAuthStateChange:', event, session?.user?.email);

      if (event === 'INITIAL_SESSION') {
        // Initial load — session from storage
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          if (mounted) updateState(session.user, session, profile);
        } else {
          if (mounted) updateState(null, null, null);
        }
      } else if (event === 'SIGNED_IN' && session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (mounted) {
          updateState(session.user, session, profile);
          logAuthEvent(session.user.id, session.user.email || '', 'login');
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (mounted) updateState(session.user, session, profile);
      } else if (event === 'SIGNED_OUT') {
        if (mounted) updateState(null, null, null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile, updateState]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (state.user) {
      await logAuthEvent(state.user.id, state.user.email || '', 'logout');
    }
    await supabase.auth.signOut();
    setState({
      user: null, session: null, profile: null,
      isLoading: false, isAuthenticated: false, isAdmin: false, needs2FA: false,
    });
  }, [state.user]);

  const requestWhatsAppCode = useCallback(async (phone: string) => {
    if (!state.user) return { error: 'Não autenticado.' };

    const code = String(100000 + Math.floor(Math.random() * 900000));

    const { error } = await supabase.from('auth_requests').insert({
      profile_id: state.user.id,
      phone,
      code,
      status: 'pending',
    });

    if (error) {
      console.error('[Auth] Error creating 2FA request:', error);
      return { error: 'Falha ao solicitar código.' };
    }

    // TODO: Integrar com WhatsApp Business API para enviar o código
    // Por enquanto, admin pode ver o código no painel
    console.log(`[2FA] Código para ${phone}: ${code}`);

    await logAuthEvent(state.user.id, state.user.email || '', '2fa_request', { phone });

    return { success: true };
  }, [state.user]);

  const verifyWhatsAppCode = useCallback(async (code: string) => {
    if (!state.user) return { error: 'Não autenticado.' };

    const { data: request, error } = await supabase
      .from('auth_requests')
      .select('*')
      .eq('profile_id', state.user.id)
      .eq('code', code.trim())
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !request) {
      await logAuthEvent(state.user.id, state.user.email || '', '2fa_failed', { code });
      return { error: 'Código inválido ou expirado.' };
    }

    // Mark request as verified
    await supabase.from('auth_requests').update({ status: 'verified' }).eq('id', request.id);

    // Update profile
    await supabase.from('profiles').update({
      whatsapp_verified: true,
      phone: request.phone,
    }).eq('id', state.user.id);

    await logAuthEvent(state.user.id, state.user.email || '', '2fa_verified', { phone: request.phone });

    // Refresh profile
    const profile = await fetchProfile(state.user.id);
    updateState(state.user, state.session, profile);

    return { success: true };
  }, [state.user, state.session, fetchProfile, updateState]);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await fetchProfile(state.user.id);
    updateState(state.user, state.session, profile);
  }, [state.user, state.session, fetchProfile, updateState]);

  const logTransaction = useCallback(async (
    action: string,
    entityType: string,
    entityId?: string,
    description?: string,
    oldData?: unknown,
    newData?: unknown
  ) => {
    if (!state.user) return;
    try {
      await supabase.from('transaction_logs').insert({
        profile_id: state.user.id,
        email: state.user.email,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
      });
    } catch (e) {
      console.warn('[TransactionLog] Failed:', e);
    }
  }, [state.user]);

  return (
    <AuthContext.Provider value={{
      ...state,
      signInWithGoogle,
      signOut,
      requestWhatsAppCode,
      verifyWhatsAppCode,
      refreshProfile,
      logTransaction,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
