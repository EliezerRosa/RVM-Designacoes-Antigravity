import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface RpcResult {
  success?: boolean;
  error?: string;
  phone?: string;
}

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

type SessionSource = 'bootstrap' | 'INITIAL_SESSION' | 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

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

function getRpcResult(data: unknown): RpcResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as RpcResult;
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

    let profile = data as Profile | null;

    if (profile && profile.role === 'publicador' && !profile.publisher_id) {
      const { data: linkData, error: linkError } = await supabase.rpc('sync_profile_publisher_link');
      if (linkError) {
        console.warn('[Auth] Failed to sync publisher link:', linkError);
      } else {
        const linkResult = getRpcResult(linkData);
        if (linkResult.success) {
          const { data: refreshedProfile, error: refreshError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (refreshError) {
            console.warn('[Auth] Failed to refetch profile after publisher link sync:', refreshError);
          } else {
            profile = refreshedProfile as Profile | null;
          }
        }
      }
    }

    console.log('[Auth] Profile fetched:', profile ? `${profile.email} (${profile.role})` : 'NULL');
    return profile;
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

  const processedSessionKeyRef = useRef<string | null>(null);
  const loggedSessionKeyRef = useRef<string | null>(null);

  const hydrateSession = useCallback(async (session: Session | null, source: SessionSource) => {
    if (!session?.user) {
      processedSessionKeyRef.current = null;
      updateState(null, null, null);
      return;
    }

    const sessionKey = `${session.user.id}:${session.access_token}`;

    if (source === 'SIGNED_IN' && loggedSessionKeyRef.current !== sessionKey) {
      loggedSessionKeyRef.current = sessionKey;
      void logAuthEvent(session.user.id, session.user.email || '', 'login');
    }

    if (processedSessionKeyRef.current === sessionKey) {
      console.log('[Auth] Skipping duplicate session hydrate for', session.user.email, source);
      return;
    }

    processedSessionKeyRef.current = sessionKey;
    const profile = await fetchProfile(session.user.id);
    updateState(session.user, session, profile);
  }, [fetchProfile, updateState]);

  // Deterministic bootstrap: load current session once, then react to subsequent auth events.
  useEffect(() => {
    let mounted = true;

    // IMPORTANT: Do NOT await supabase queries inside this callback!
    // supabase-js v2.91+ awaits callbacks internally while holding navigator.locks.
    // Calling fetchProfile (which needs getSession → same lock) causes a deadlock.
    // Instead, schedule profile fetch via setTimeout(0) to run outside the lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      console.log('[Auth] onAuthStateChange:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        processedSessionKeyRef.current = null;
        loggedSessionKeyRef.current = null;
        if (mounted) updateState(null, null, null);
        return;
      }

      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) {
        setTimeout(async () => {
          if (!mounted) return;
          await hydrateSession(session, event);
        }, 0);
      }
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          console.error('[Auth] Failed to bootstrap session:', error);
          updateState(null, null, null);
          return;
        }

        await hydrateSession(data.session, 'bootstrap');
      } catch (error) {
        console.error('[Auth] Unexpected bootstrap error:', error);
        if (mounted) {
          updateState(null, null, null);
        }
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [hydrateSession, updateState]);

  const signInWithGoogle = useCallback(async () => {
    // Preservar query params (ex: ?portal=confirm&id=...) para que o usuário
    // retorne à mesma página após login OAuth
    const returnUrl = window.location.search
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : `${window.location.origin}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: returnUrl,
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

    const { data, error } = await supabase.rpc('create_whatsapp_auth_request', {
      p_phone: phone,
      p_code: code,
    });

    if (error) {
      console.error('[Auth] Error creating 2FA request:', error);
      return { error: 'Falha ao solicitar código.' };
    }

    const result = getRpcResult(data);
    if (!result.success) {
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

    const { data, error } = await supabase.rpc('verify_whatsapp_auth_code', {
      p_code: code.trim(),
    });

    if (error) {
      console.error('[Auth] Error verifying 2FA code:', error);
      await logAuthEvent(state.user.id, state.user.email || '', '2fa_failed', { code });
      return { error: 'Falha ao verificar o código.' };
    }

    const result = getRpcResult(data);
    if (!result.success) {
      await logAuthEvent(state.user.id, state.user.email || '', '2fa_failed', { code });
      return {
        error: result.error === 'invalid_or_expired'
          ? 'Código inválido ou expirado.'
          : 'Falha ao verificar o código.',
      };
    }

    await logAuthEvent(state.user.id, state.user.email || '', '2fa_verified', { phone: result.phone });

    // Refresh profile
    const profile = await fetchProfile(state.user.id);
    if (!profile) {
      return { error: 'Código validado, mas não foi possível recarregar seu perfil.' };
    }
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
