import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

export function CustomPushModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState('all');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      alert('Preencha título e mensagem.');
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-custom-push', {
        body: {
          title: title.trim(),
          body: body.trim(),
          target_role: targetRole
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResult({ success: true, msg: `Sucesso! Disparado para ${data.sentCount} dispositivos.` });
      setTitle('');
      setBody('');
    } catch (err: any) {
      console.error('Erro ao disparar custom push:', err);
      setResult({ success: false, msg: err.message || 'Falha ao enviar.' });
    } finally {
      setIsSending(false);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: '#1e293b', width: '100%', maxWidth: '400px',
        padding: '24px', borderRadius: '12px', border: '1px solid #334155'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#f8fafc' }}>📣 Enviar Aviso (Megafone)</h3>
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9em', marginBottom: '4px' }}>Título</label>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)}
            style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
            placeholder="Ex: Reunião de Campo"
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9em', marginBottom: '4px' }}>Mensagem</label>
          <textarea 
            value={body} 
            onChange={e => setBody(e.target.value)}
            style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px', minHeight: '80px' }}
            placeholder="Ex: A saída hoje será no Salão, às 09:30."
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9em', marginBottom: '4px' }}>Destinatários</label>
          <select 
            value={targetRole} 
            onChange={e => setTargetRole(e.target.value)}
            style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
          >
            <option value="all">Todos (Administradores e Publicadores)</option>
            <option value="publicador">Apenas Publicadores</option>
            <option value="admin">Apenas Administradores</option>
          </select>
        </div>

        {result && (
          <div style={{ padding: '8px', marginBottom: '16px', borderRadius: '4px', background: result.success ? '#064e3b' : '#7f1d1d', color: '#fff', fontSize: '0.9em' }}>
            {result.msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer' }}
          >
            Fechar
          </button>
          <button 
            onClick={handleSend}
            disabled={isSending}
            style={{ padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: isSending ? 'not-allowed' : 'pointer' }}
          >
            {isSending ? 'Enviando...' : 'Disparar Web Push'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
