import React, { useState, useEffect } from 'react';
import { subscribeToWebPush } from '../services/pushService';
import { supabase } from '../lib/supabase';

export const PushSubscribeButton: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // S exibe se for suportado pelo navegador
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  useEffect(() => {
    // Check if already subscribed
    navigator.serviceWorker.ready.then(async (registration) => {
      try {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
          setStatus('success');
        }
      } catch (err) {
        console.error('Erro ao verificar inscricao Push:', err);
      }
    });
  }, []);

  const handleSubscribe = async () => {
    setStatus('loading');
    setErrorMessage('');

    const { success, error } = await subscribeToWebPush(supabase);

    if (success) {
      setStatus('success');
    } else {
      setStatus('error');
      setErrorMessage(error || 'Erro ao inscrever.');
    }
  };

  return (
    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#fff' }}>Notificações Nativas do Aparelho</h3>
      <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#9CA3AF' }}>
        Receba avisos importantes de designação diretamente no seu dispositivo, sem depender do WhatsApp.
      </p>

      {status === 'success' ? (
        <div style={{ color: 'green', fontWeight: 'bold' }}>✅ Notificações Ativadas!</div>
      ) : (
        <>
          <button 
            onClick={handleSubscribe} 
            disabled={status === 'loading'}
            style={{
              padding: '8px 16px',
              background: '#0052cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer'
            }}
          >
            {status === 'loading' ? 'Ativando...' : 'Ativar Notificações'}
          </button>
          {status === 'error' && (
            <div style={{ color: 'red', marginTop: '8px', fontSize: '0.85rem' }}>❌ {errorMessage}</div>
          )}
        </>
      )}
    </div>
  );
};
