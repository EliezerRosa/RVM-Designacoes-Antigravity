/**
 * AuthSystemConfigPanel — Painel de Configuração do Modo Global de Autenticação na aba Admin
 *
 * Permite ao Administrador definir a modalidade de login global do aplicativo:
 * - google_oauth: Google OAuth Padrão
 * - google_whatsapp_2fa: Google OAuth + Verificação 2FA via WhatsApp
 * - device_biometric: Login por Desbloqueio Nativo / Biometria / PIN do Aparelho (WebAuthn)
 * - flexible: Flexível (Usuário escolhe na tela de entrada)
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { AuthSystemMode } from '../../services/deviceAuthService';

interface ModeOption {
    id: AuthSystemMode;
    title: string;
    description: string;
    icon: string;
    badge?: string;
}

const MODES: ModeOption[] = [
    {
        id: 'google_whatsapp_2fa',
        title: 'Google OAuth + 2FA WhatsApp',
        description: 'Exige login pelo Google e verificação de 6 dígitos enviada no WhatsApp do publicador.',
        icon: '🟢',
        badge: 'Atual',
    },
    {
        id: 'google_oauth',
        title: 'Google OAuth Padrão',
        description: 'Login direto com a Conta Google autorizada, sem exigência de código por WhatsApp.',
        icon: '🔵',
    },
    {
        id: 'device_biometric',
        title: 'Biometria / PIN do Aparelho (WebAuthn)',
        description: 'Acesso super rápido usando TouchID, FaceID, Biometria Android ou PIN nativo do próprio dispositivo.',
        icon: '🔑',
        badge: 'Recomendado',
    },
    {
        id: 'flexible',
        title: 'Modo Flexível',
        description: 'Exibe as opções na tela de login para que cada usuário escolha seu método preferido.',
        icon: '🔀',
    },
];

export function AuthSystemConfigPanel() {
    const [currentMode, setCurrentMode] = useState<AuthSystemMode>('flexible');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        loadSetting();
    }, []);

    const loadSetting = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'auth_system_mode')
                .maybeSingle();

            if (!error && data?.value) {
                const val = typeof data.value === 'string' ? data.value : (data.value as any)?.mode;
                if (val && MODES.some(m => m.id === val)) {
                    setCurrentMode(val as AuthSystemMode);
                }
            }
        } catch (e) {
            console.warn('[AuthSystemConfig] Failed to load setting:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveMode = async (mode: AuthSystemMode) => {
        setSaving(true);
        setMsg(null);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'auth_system_mode',
                    value: JSON.stringify({ mode, updated_at: new Date().toISOString() }),
                });

            if (error) throw error;

            setCurrentMode(mode);
            setMsg({ text: 'Modo de autenticação global atualizado com sucesso!', type: 'success' });
        } catch (e) {
            const errStr = e instanceof Error ? e.message : String(e);
            setMsg({ text: `Falha ao salvar configuração: ${errStr}`, type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ color: '#94a3b8', padding: '16px' }}>Carregando configurações de login...</div>;
    }

    return (
        <div style={{ color: '#e2e8f0' }}>
            <div style={{ marginBottom: '16px' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
                    Escolha a modalidade de login que será aplicada a todos os usuários da congregação.
                </p>
            </div>

            {msg && (
                <div style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    background: msg.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: msg.type === 'success' ? '#4ade80' : '#f87171',
                    border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    fontSize: '0.85rem',
                }}>
                    {msg.text}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {MODES.map(m => {
                    const isSelected = currentMode === m.id;
                    return (
                        <div
                            key={m.id}
                            onClick={() => !saving && handleSaveMode(m.id)}
                            style={{
                                background: isSelected ? 'rgba(79, 70, 229, 0.15)' : '#0f172a',
                                border: `2px solid ${isSelected ? '#6366f1' : '#334155'}`,
                                borderRadius: '12px',
                                padding: '16px',
                                cursor: saving ? 'wait' : 'pointer',
                                transition: 'all 0.2s ease',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '1.5rem' }}>{m.icon}</span>
                                    {m.badge && (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            background: isSelected ? '#6366f1' : '#334155',
                                            color: '#fff',
                                            fontWeight: 600,
                                        }}>
                                            {m.badge}
                                        </span>
                                    )}
                                </div>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: isSelected ? '#a5b4fc' : '#f8fafc' }}>
                                    {m.title}
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                                    {m.description}
                                </p>
                            </div>

                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="radio"
                                    name="auth_mode"
                                    checked={isSelected}
                                    onChange={() => { }}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? '#818cf8' : '#64748b' }}>
                                    {isSelected ? 'Modalidade Ativa' : 'Selecionar'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
