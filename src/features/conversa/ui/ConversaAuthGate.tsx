import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { AppLockScreen } from '../../../components/AppLockScreen';

interface ConversaAuthGateProps {
  children: React.ReactNode;
}

export const ConversaAuthGate: React.FC<ConversaAuthGateProps> = ({ children }) => {
  const {
    user,
    profile,
    isLoading,
    isAuthenticated,
    needs2FA,
    authSystemMode,
    isAppUnlocked,
    signInWithDeviceAuth,
    requestWhatsAppCode,
    verifyWhatsAppCode,
    refreshProfile,
    signOut,
  } = useAuth();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorStage, setTwoFactorStage] = useState<'request' | 'verify'>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [showFallbackGoogleLogin, setShowFallbackGoogleLogin] = useState(false);
  const devAutoLoginAttemptedRef = useRef(false);

  const tryLocalDevLogin = useCallback(async (): Promise<boolean> => {
    if (
      !import.meta.env?.DEV ||
      typeof window === 'undefined' ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ) {
      return false;
    }
    try {
      const resp = await fetch('/__conversa_dev_auth', { method: 'POST' });
      if (!resp.ok) return false;
      const data = (await resp.json()) as { email?: string; hashed_token?: string };
      if (!data?.hashed_token || !data?.email) return false;
      sessionStorage.removeItem('cv_manual_logout');
      sessionStorage.setItem('rvm_unlocked', 'true');
      localStorage.setItem('rvm_last_device_user', data.email);
      localStorage.setItem(`rvm_device_registered_${data.email}`, 'true');
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: data.hashed_token,
        type: 'magiclink',
      });
      return !otpErr;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (
      isLoading ||
      isAuthenticated ||
      devAutoLoginAttemptedRef.current ||
      !import.meta.env?.DEV ||
      typeof window === 'undefined' ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ) {
      return;
    }
    try {
      if (sessionStorage.getItem('cv_manual_logout') === 'true') {
        return;
      }
    } catch {
      // ignore
    }
    devAutoLoginAttemptedRef.current = true;
    void tryLocalDevLogin();
  }, [isLoading, isAuthenticated, tryLocalDevLogin]);

  useEffect(() => {
    try {
      localStorage.removeItem('rvm_conversa_oauth_return');
      localStorage.removeItem('rvm_conversa_oauth_ts');
    } catch {
      // ignore
    }
    const params = new URLSearchParams(window.location.search);
    const errorDesc = params.get('error_description');
    if (errorDesc) {
      if (errorDesc.includes('OAuth state has expired') || errorDesc.includes('bad_oauth_state')) {
        setError(
          'A sessão de login com o Google expirou ou foi interrompida. Por favor, tente entrar novamente.'
        );
      } else {
        setError(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const loggedInLocally = await tryLocalDevLogin();
      if (loggedInLocally) {
        setIsLoggingIn(false);
        return;
      }
      const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      try {
        localStorage.setItem('rvm_conversa_oauth_return', redirectTo);
        localStorage.setItem('rvm_conversa_oauth_ts', String(Date.now()));
      } catch {
        // ignore
      }
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (oauthErr) throw oauthErr;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar login com o Google.');
      setIsLoggingIn(false);
    }
  };

  const handleDeviceLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const target = localStorage.getItem('rvm_last_device_user') || undefined;
      const res = await signInWithDeviceAuth(target);
      if (!res.success) {
        setShowFallbackGoogleLogin(true);
        if (res.error === 'Dispositivo ou navegador não suporta Biometria/Passkeys.') {
          setError('Biometria não suportada neste navegador. Use a opção do Google abaixo.');
        } else {
          setError(
            res.error ||
              'Este dispositivo ainda não possui PIN/biometria vinculado. Entre com o Google primeiro.'
          );
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar pelo dispositivo.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Informe um número de WhatsApp válido com DDD.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await requestWhatsAppCode(cleanPhone);
      if (res.error) {
        setError(res.error);
      } else {
        setTwoFactorStage('verify');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim().length !== 6) {
      setError('O código deve ter 6 dígitos.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await verifyWhatsAppCode(code.trim());
      if (res.error) {
        setError(res.error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="cv-auth-container">
        <div className="cv-auth-card" style={{ textAlign: 'center' }}>
          <div className="cv-auth-logo">⏳</div>
          <h2 className="cv-auth-title">Carregando Conversa RVM</h2>
          <p className="cv-auth-subtitle">Verificando sua sessão de acesso...</p>
        </div>
      </div>
    );
  }

  if (needs2FA && user) {
    return (
      <div className="cv-auth-container">
        <div className="cv-auth-card">
          <div className="cv-auth-header">
            <div className="cv-auth-logo">🔐</div>
            <h1 className="cv-auth-title">Verificação de Segurança</h1>
            <p className="cv-auth-subtitle">Autenticado como {user.email}</p>
          </div>

          {error && <div className="cv-inline-error">{error}</div>}

          {twoFactorStage === 'request' ? (
            <form onSubmit={handleRequestCode} className="cv-auth-actions">
              <p className="cv-auth-subtitle">
                Para sua segurança, confirme sua identidade com um código enviado para o seu WhatsApp.
              </p>
              <input
                type="tel"
                className="cv-auth-input"
                placeholder="WhatsApp com DDD (ex: 11999998888)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <button
                type="submit"
                className="cv-auth-btn cv-auth-btn-primary"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Enviando...' : 'Enviar código via WhatsApp'}
              </button>
              <button
                type="button"
                className="cv-auth-btn"
                onClick={() => void signOut()}
              >
                Sair / Trocar conta
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="cv-auth-actions">
              <p className="cv-auth-subtitle">Digite o código de 6 dígitos enviado para {phone}:</p>
              <input
                type="text"
                inputMode="numeric"
                className="cv-auth-input"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '20px' }}
              />
              <button
                type="submit"
                className="cv-auth-btn cv-auth-btn-primary"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Verificando...' : 'Verificar código'}
              </button>
              <button
                type="button"
                className="cv-auth-btn"
                onClick={() => setTwoFactorStage('request')}
              >
                Reenviar / Alterar telefone
              </button>
              <button
                type="button"
                className="cv-auth-btn"
                onClick={() => void signOut()}
              >
                Sair / Trocar conta
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const effectiveMode = authSystemMode || 'flexible';
    const hasLastUser =
      typeof window !== 'undefined' && Boolean(localStorage.getItem('rvm_last_device_user'));
    const showBiometric =
      hasLastUser && (effectiveMode === 'device_biometric' || effectiveMode === 'flexible');
    const showGoogle =
      effectiveMode === 'google_oauth' ||
      effectiveMode === 'google_whatsapp_2fa' ||
      effectiveMode === 'flexible' ||
      effectiveMode === 'device_biometric' ||
      showFallbackGoogleLogin;

    return (
      <div className="cv-auth-container">
        <div className="cv-auth-card">
          <div className="cv-auth-header">
            <div className="cv-auth-logo">💬</div>
            <h1 className="cv-auth-title">Conversa RVM</h1>
            <p className="cv-auth-subtitle">
              Acesso seguro para consultar designações, semanas e regras da congregação
            </p>
          </div>

          {error && <div className="cv-inline-error">{error}</div>}

          <div className="cv-auth-actions">
            {showBiometric && (
              <button
                type="button"
                className="cv-auth-btn cv-auth-btn-primary"
                onClick={() => void handleDeviceLogin()}
                disabled={isLoggingIn}
              >
                📱 {isLoggingIn ? 'Autenticando...' : 'Entrar com Biometria / PIN'}
              </button>
            )}

            {showGoogle && (
              <button
                type="button"
                className="cv-auth-btn"
                onClick={() => void handleGoogleLogin()}
                disabled={isLoggingIn}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {isLoggingIn ? 'Conectando...' : 'Entrar com Conta Google'}
              </button>
            )}
          </div>

          <div className="cv-auth-footer">
            <span>Mesma autenticação do RVM</span>
            <a className="cv-auth-link" href="./index.html">
              Abrir RVM completo
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!isAppUnlocked) {
    return <AppLockScreen />;
  }

  if (user && !profile) {
    return (
      <div className="cv-auth-container">
        <div className="cv-auth-card">
          <div className="cv-auth-header">
            <div className="cv-auth-logo">🪪</div>
            <h1 className="cv-auth-title">Perfil em Carregamento</h1>
            <p className="cv-auth-subtitle">
              Conectado como {user.email}, mas o perfil de congregação ainda não foi encontrado.
            </p>
          </div>
          <div className="cv-auth-actions">
            <button
              type="button"
              className="cv-auth-btn cv-auth-btn-primary"
              onClick={() => void refreshProfile()}
            >
              Recarregar perfil
            </button>
            <button
              type="button"
              className="cv-auth-btn"
              onClick={() => void signOut()}
            >
              Sair / Trocar conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

