import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import * as pushService from '../services/pushService';
import { PwaInstallBanner } from './ui/PwaInstallBanner';

interface Props {
  publisherId: string;
}

export function PushOnboardingPortal({ publisherId }: Props) {
  const [publisherName, setPublisherName] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    async function init() {
      // 1. Fetch publisher name
      const { data, error } = await supabase
        .from('publishers')
        .select('data')
        .eq('id', publisherId)
        .maybeSingle();

      if (error || !data) {
        setStatus('error');
        setErrorMessage('Publicador não encontrado.');
        return;
      }

      setPublisherName(data.data.name || 'Publicador');
      
      // 2. Check if already subscribed
      try {
        const hasSub = await pushService.hasSubscription();
        if (hasSub) {
          setStatus('success');
        } else {
          setStatus('idle');
        }
      } catch (err) {
        console.warn('Erro ao checar subscription:', err);
        setStatus('idle');
      }
    }
    init();
  }, [publisherId]);

  const handleSubscribe = async () => {
    setStatus('loading');
    try {
      // Pedir permissão e inscrever
      const result = await pushService.subscribeToWebPush(supabase, publisherId);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(result.error || 'Erro desconhecido ao ativar notificações.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao processar ativação.');
    }
  };

  if (status === 'loading' && !publisherName) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <div style={{ color: '#94a3b8' }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '24px' 
    }}>
      <PwaInstallBanner />
      <div style={{ 
        width: '100%', 
        maxWidth: '480px', 
        background: '#1e293b', 
        border: '1px solid #334155', 
        borderRadius: '16px', 
        padding: '32px', 
        color: '#f8fafc',
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', color: '#f8fafc' }}>
          Notificações Ativas
        </h2>
        <p style={{ margin: '0 0 24px 0', color: '#94a3b8', lineHeight: 1.6 }}>
          Olá, <strong>{publisherName}</strong>. Ative as notificações no seu dispositivo para receber seus lembretes e designações da RVM diretamente na sua tela, sem depender do WhatsApp.
        </p>

        {status === 'success' && (
          <div style={{ background: '#064e3b', color: '#34d399', padding: '16px', borderRadius: '12px', border: '1px solid #059669', marginBottom: '24px' }}>
            <strong>✅ Tudo certo!</strong>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem' }}>
              Este dispositivo já está recebendo notificações push.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '16px', borderRadius: '12px', border: '1px solid #ef4444', marginBottom: '24px' }}>
            <strong>❌ Oops...</strong>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem' }}>
              {errorMessage}
            </p>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#f87171' }}>
              Dica: Certifique-que seu navegador (Chrome/Safari) tem permissão para enviar notificações.
            </p>
          </div>
        )}

        {(status === 'idle' || status === 'error') && (
          <button 
            onClick={handleSubscribe}
            disabled={status === 'loading'}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '14px 24px',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: status === 'loading' ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            {status === 'loading' ? 'Ativando...' : 'Ativar Notificações Push'}
          </button>
        )}
      </div>
    </div>
  );
}
