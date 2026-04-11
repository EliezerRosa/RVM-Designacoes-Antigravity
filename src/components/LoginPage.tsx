import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, needs2FA, signInWithGoogle, requestWhatsAppCode, verifyWhatsAppCode } = useAuth();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorStage, setTwoFactorStage] = useState<'request' | 'verify'>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar login';
      setError(msg);
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

    const result = await requestWhatsAppCode(cleanPhone);
    if (result.error) {
      setError(result.error);
    } else {
      setTwoFactorStage('verify');
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (code.trim().length !== 6) {
      setError('O código deve ter 6 dígitos.');
      return;
    }

    const result = await verifyWhatsAppCode(code.trim());
    if (result.error) {
      setError(result.error);
    }
    // Se sucesso, AuthContext atualiza e App.tsx redireciona automaticamente
  };

  // 2FA flow (já logou com Google, precisa verificar WhatsApp)
  if (needs2FA && user) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>RVM Designações</h1>
            <p style={styles.subtitle}>Verificação em 2 Etapas</p>
          </div>

          <div style={styles.userBadge}>
            <span style={styles.userIcon}>👤</span>
            <span>{user.email}</span>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {twoFactorStage === 'request' ? (
            <form onSubmit={handleRequestCode} style={styles.form}>
              <p style={styles.info}>
                Para sua segurança, vincule seu WhatsApp. O administrador enviará um código de 6 dígitos.
              </p>
              <label style={styles.label}>Seu WhatsApp (com DDD)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: 27999999999"
                required
                style={styles.input}
              />
              <button type="submit" style={styles.btnBlue}>
                📱 Solicitar Código
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} style={styles.form}>
              <p style={styles.info}>
                Sua solicitação foi registrada. O administrador enviará o código de 6 dígitos pelo WhatsApp.
              </p>
              <label style={styles.label}>Código recebido no WhatsApp</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                maxLength={6}
                style={{ ...styles.input, ...styles.codeInput }}
              />
              <button type="submit" style={styles.btnGreen}>
                ✅ Verificar e Entrar
              </button>
              <button
                type="button"
                onClick={() => { setTwoFactorStage('request'); setError(null); }}
                style={styles.btnLink}
              >
                ← Solicitar novo código
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Login inicial (Google)
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>RVM Designações</h1>
          <p style={styles.subtitle}>Acesso restrito para membros autorizados</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          style={{
            ...styles.btnGoogle,
            opacity: isLoggingIn ? 0.6 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 10 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {isLoggingIn ? 'Conectando...' : 'Entrar com Conta Google'}
        </button>

        <p style={styles.footer}>
          Após o login com Google, será necessário verificar seu WhatsApp para completar o acesso.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    maxWidth: '420px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  header: {
    textAlign: 'center',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#f1f5f9',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: '0.5rem',
    fontSize: '0.875rem',
  },
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#334155',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
  },
  userIcon: {
    fontSize: '1.25rem',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  info: {
    color: '#94a3b8',
    fontSize: '0.825rem',
    lineHeight: 1.5,
    margin: 0,
  },
  label: {
    color: '#cbd5e1',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    padding: '0.875rem 1rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.75rem',
    color: '#f1f5f9',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: '1.5rem',
    letterSpacing: '0.5em',
    fontFamily: 'monospace',
  },
  btnBlue: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  btnGreen: {
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  btnGoogle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  btnLink: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: '0.5rem',
  },
  footer: {
    color: '#64748b',
    fontSize: '0.75rem',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.5,
  },
};
