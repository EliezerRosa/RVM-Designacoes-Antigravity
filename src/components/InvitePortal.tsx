import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface InvitePortalProps {
  token: string;
}

export function InvitePortal({ token }: InvitePortalProps) {
  const { isAuthenticated, isLoading, signInWithGoogle, needs2FA } = useAuth();
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    async function consumeToken() {
      if (!isAuthenticated) return;
      
      setStatus('processing');
      try {
        const { data, error } = await supabase.rpc('consume_onboarding_token', {
          p_token: token
        });

        if (error) {
          throw new Error(error.message || 'Erro ao processar convite');
        }

        setStatus('success');
        
        // Wait a few seconds then redirect to home
        setTimeout(() => {
          window.location.href = window.location.origin;
        }, 3000);
        
      } catch (err: any) {
        console.error('Failed to consume token:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Convite inválido, expirado ou já utilizado.');
      }
    }

    if (!isLoading && isAuthenticated) {
      // User is logged in, meaning they just returned from Google OAuth or were already logged in
      consumeToken();
    }
  }, [isAuthenticated, isLoading, token]);

  const handleLogin = async () => {
    setStatus('authenticating');
    try {
      await signInWithGoogle();
      // Browser will redirect to Google here
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg('Falha ao abrir a tela de login do Google.');
    }
  };

  const handleGoHome = () => {
    window.location.href = window.location.origin;
  };

  // UI Rendering
  const isProcessing = isLoading || status === 'authenticating' || status === 'processing';

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '560px', background: '#111827', border: '1px solid #334155', borderRadius: '16px', padding: '32px', color: '#e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)', textAlign: 'center' }}>
        
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎟️</div>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.5rem', color: '#fff' }}>Convite Exclusivo</h2>

        {status === 'success' ? (
          <div>
            <div style={{ fontSize: '3rem', margin: '24px 0' }}>✅</div>
            <h3 style={{ color: '#10b981' }}>Conta Vinculada com Sucesso!</h3>
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>
              Seu acesso foi configurado. Redirecionando você para o sistema...
            </p>
          </div>
        ) : status === 'error' ? (
          <div>
            <div style={{ fontSize: '3rem', margin: '24px 0' }}>❌</div>
            <h3 style={{ color: '#ef4444' }}>Ops, algo deu errado</h3>
            <p style={{ color: '#f87171', margin: '12px 0 24px 0', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
              {errorMsg}
            </p>
            <button 
              onClick={handleGoHome}
              style={{ padding: '12px 24px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
            >
              Voltar ao Início
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: '#cbd5e1', lineHeight: 1.6, marginBottom: '24px', fontSize: '1.1rem' }}>
              Você foi convidado a acessar o sistema RVM Designações.
              Para ativar sua conta e pular a verificação de segurança, clique no botão abaixo para entrar com o Google.
            </p>
            
            <button
              onClick={handleLogin}
              disabled={isProcessing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                width: '100%',
                padding: '16px',
                background: '#fff',
                color: '#1e293b',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.7 : 1,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
            >
              {isProcessing ? (
                <>
                  <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderColor: '#1e293b', borderTopColor: 'transparent' }}></div>
                  Processando...
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar com Google
                </>
              )}
            </button>
            <p style={{ marginTop: '16px', fontSize: '0.85rem', color: '#64748b' }}>
              Ao continuar, o número de WhatsApp no qual você recebeu este link será verificado automaticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
