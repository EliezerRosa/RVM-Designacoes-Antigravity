import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export function ZApiConfigPanel() {
    const [isActive, setIsActive] = useState(false);
    const [groupId, setGroupId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const active = await api.getSetting<string | boolean>('zapi_automation_active', false);
            const group = await api.getSetting<string>('zapi_group_id', '');
            setIsActive(active === 'true' || active === true);
            setGroupId(group || '');
        } catch (err) {
            console.error('Erro ao carregar configs Z-API', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage('');
            await api.setSetting('zapi_automation_active', isActive ? 'true' : 'false');
            await api.setSetting('zapi_group_id', groupId.trim());
            setMessage('Configurações salvas com sucesso!');
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setMessage('Erro ao salvar configurações.');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Carregando configurações...</div>;

    return (
        <div className="zapi-config-panel" style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', cursor: 'pointer' }}>
                    <input 
                        type="checkbox" 
                        checked={isActive} 
                        onChange={e => setIsActive(e.target.checked)}
                        style={{ width: '20px', height: '20px' }}
                    />
                    <strong>Ativar Automação Z-API Background</strong>
                </label>
                <p style={{ margin: '8px 0 0 30px', color: '#94a3b8' }}>
                    Quando ativado, o sistema enviará recibos de confirmação de designação e alertas de recusa automaticamente via WhatsApp.
                </p>
            </div>

            <div style={{ marginBottom: '20px', marginLeft: '30px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    ID do Grupo de Alertas (Opcional):
                </label>
                <input 
                    type="text" 
                    value={groupId}
                    onChange={e => setGroupId(e.target.value)}
                    placeholder="Ex: 120363045612345678@g.us"
                    style={{ width: '100%', maxWidth: '400px', padding: '10px', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff' }}
                />
                <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                    Se preenchido, os alertas de recusa serão enviados para este grupo. Caso contrário, serão enviados diretamente para o Superintendente da RVM.
                </p>
            </div>

            <div style={{ marginLeft: '30px' }}>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    {saving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
                {message && <span style={{ marginLeft: '15px', color: message.includes('Erro') ? '#ef4444' : '#10b981' }}>{message}</span>}
            </div>
        </div>
    );
}
