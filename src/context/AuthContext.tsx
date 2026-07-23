import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from '../services/whatsappAutoService';

import { deviceAuthService, type AuthSystemMode, type DeviceAuthResult } from '../services/deviceAuthService';

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
  authSystemMode: AuthSystemMode;
}

type SessionSource = 'bootstrap' | 'INITIAL_SESSION' | 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

interface AuthContextType extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signInWithDeviceAuth: (email?: string) => Promise<DeviceAuthResult>;
  registerDeviceAuth: () => Promise<DeviceAuthResult>;
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
    authSystemMode: 'flexible',
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

    if (user?.email) {
      try {
        localStorage.setItem('rvm_last_device_user', user.email);
        const hasDeviceAuth = localStorage.getItem(`rvm_device_auth_${user.email}`);
        if (!hasDeviceAuth && user.id) {
          import('../services/deviceAuthService').then(({ deviceAuthService }) => {
            deviceAuthService.registerDevice(user.email!, user.id);
          });
        }
      } catch (e) { /* ignore */ }
    }

    setState(prev => ({
      ...prev,
      user,
      session,
      profile,
      isLoading: false,
      isAuthenticated: !!user && !!profile && (profile.whatsapp_verified || isAdmin),
      isAdmin,
      needs2FA,
    }));
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
      } else if (event === 'INITIAL_SESSION' && !session) {
        // If there's no session initially (e.g. invalid token, clock skew, or just not logged in)
        // we must call updateState to clear isLoading
        if (mounted) updateState(null, null, null);
      }
    });

    // Fallback: if gotrue-js completely crashes internally during initialize (e.g. due to severe clock skew AbortError)
    // and never fires INITIAL_SESSION, we force the loading state to finish after 3 seconds.
    const fallbackTimer = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Fallback timeout reached. Supabase initialize may have crashed. Forcing login screen.');
        // We only want to force updateState if we haven't processed a session yet
        if (!processedSessionKeyRef.current && !loggedSessionKeyRef.current) {
           updateState(null, null, null);
        }
      }
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [hydrateSession, updateState]);

  // Load global authSystemMode setting from app_settings
  useEffect(() => {
    const loadAuthMode = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'auth_system_mode')
          .maybeSingle();

        if (data?.value) {
          const raw = data.value;
          const parsed = typeof raw === 'string' ? (raw.startsWith('{') ? JSON.parse(raw) : raw) : raw;
          const modeVal = typeof parsed === 'object' ? parsed.mode : parsed;

          if (modeVal && ['google_oauth', 'google_whatsapp_2fa', 'device_biometric', 'flexible'].includes(modeVal)) {
            console.log('[Auth] Loaded global auth_system_mode:', modeVal);
            setState(prev => ({ ...prev, authSystemMode: modeVal as AuthSystemMode }));
          }
        }
      } catch (e) {
        console.warn('[Auth] Failed to load auth_system_mode setting:', e);
      }
    };
    loadAuthMode();
  }, []);

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
      if (result.error === 'phone_already_in_use') {
        return { error: 'Este número de WhatsApp já está vinculado a outra conta.' };
      }
      return { error: 'Falha ao solicitar código.' };
    }

    console.log(`[2FA] Código para ${phone}: ${code} (Enviando via whatsappAutoService)`);

    try {
      const wa = createWhatsAppAutoServiceFromEnv();
      const msg = `*RVM Designações*\n\nSeu código de acesso é: *${code}*\n\n_Não compartilhe este código com ninguém._`;
      const sendResult = await wa.sendText(phone, msg);
      
      if (!sendResult.success && !sendResult.manual) {
        console.warn('[2FA] Aviso: falha no envio automático, admin pode ver o código no painel.', sendResult.error);
        // Não falhamos o login aqui para permitir que o admin repasse manualmente
      }
    } catch (e) {
      console.error('[2FA] Erro ao instanciar ou enviar via whatsappAutoService:', e);
    }

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
      
      let errorMsg = 'Falha ao verificar o código.';
      if (result.error === 'invalid_or_expired') {
        errorMsg = 'Código inválido ou expirado.';
      } else if (result.error === 'phone_already_in_use') {
        errorMsg = 'Este número de WhatsApp já está vinculado a outra conta.';
      }

      return { error: errorMsg };
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

  const signInWithDeviceAuth = useCallback(async (email?: string): Promise<DeviceAuthResult> => {
    const result = await deviceAuthService.authenticate(email);
    if (result.success && result.email) {
      await logAuthEvent(state.user?.id ?? null, result.email, 'device_biometric_login');
    }
    return result;
  }, [state.user]);

  const registerDeviceAuth = useCallback(async (): Promise<DeviceAuthResult> => {
    if (!state.user || !state.profile) {
      return { success: false, error: 'Usuário não autenticado.' };
    }
    const result = await deviceAuthService.registerDevice(state.user.email || '', state.user.id);
    if (result.success) {
      await logAuthEvent(state.user.id, state.user.email || '', 'device_biometric_registered');
    }
    return result;
  }, [state.user, state.profile]);

  return (
    <AuthContext.Provider value={{
      ...state,
      signInWithGoogle,
      signInWithDeviceAuth,
      registerDeviceAuth,
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
