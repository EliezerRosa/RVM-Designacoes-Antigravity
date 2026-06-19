import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from '../../services/whatsappAutoService';

interface PublisherTarget {
    id: string;
    name: string;
    phone: string;
}

interface OnboardingBatchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function OnboardingBatchModal({ isOpen, onClose }: OnboardingBatchModalProps) {
    const [targets, setTargets] = useState<PublisherTarget[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            loadEligiblePublishers();
        } else {
            // Reset state on close
            setTargets([]);
            setSelectedIds(new Set());
            setStatus('idle');
            setProgress({ current: 0, total: 0 });
            setLogs([]);
        }
    }, [isOpen]);

    const loadEligiblePublishers = async () => {
        setLoading(true);
        try {
            // 1. Obter todos os publicadores
            const { data: pubs, error: pubErr } = await supabase.from('publishers').select('*');
            if (pubErr) throw pubErr;
            
            // 2. Obter perfis já validados
            const { data: profiles, error: profErr } = await supabase.from('profiles').select('publisher_id').eq('whatsapp_verified', true);
            if (profErr) throw profErr;
            
            const verifiedPubIds = new Set(profiles.map(p => p.publisher_id).filter(Boolean));
            
            const eligible: PublisherTarget[] = [];
            
            for (const p of pubs) {
                if (verifiedPubIds.has(p.id)) continue;
                const rawPhone = p.data?.phone || p.data?.contact_phone;
                if (!rawPhone || typeof rawPhone !== 'string') continue;
                const cleanPhone = rawPhone.replace(/\D/g, '');
                if (cleanPhone.length < 10) continue;
                
                eligible.push({
                    id: p.id,
                    name: p.data.name,
                    phone: cleanPhone
                });
            }
            
            eligible.sort((a, b) => a.name.localeCompare(b.name));
            
            setTargets(eligible);
            // Auto-select all by default
            setSelectedIds(new Set(eligible.map(e => e.id)));
        } catch (error) {
            console.error('Erro ao carregar publicadores elegíveis:', error);
            setLogs(['❌ Falha ao buscar lista do servidor.']);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id: string) => {
        if (status === 'running') return;
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (status === 'running') return;
        setSelectedIds(new Set(targets.map(t => t.id)));
    };

    const handleSelectNone = () => {
        if (status === 'running') return;
        setSelectedIds(new Set());
    };

    const handleDispatch = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Deseja disparar ${selectedIds.size} convites Z-API agora?`)) return;

        setStatus('running');
        setLogs(['Iniciando disparos em lote...']);
        
        const dispatchList = targets.filter(t => selectedIds.has(t.id));
        setProgress({ total: dispatchList.length, current: 0 });
        
        const waService = createWhatsAppAutoServiceFromEnv();

        for (let i = 0; i < dispatchList.length; i++) {
            const pub = dispatchList[i];
            
            try {
                // Generate token
                const { data: tokenData, error: tokenErr } = await supabase
                    .from('onboarding_tokens')
                    .insert({ publisher_id: pub.id, phone: pub.phone })
                    .select('token')
                    .single();
                    
                if (tokenErr) throw tokenErr;
                
                const inviteLink = `${window.location.origin}/?portal=invite&token=${tokenData.token}`;
                const msg = `Olá *${pub.name}*, tudo bem?\n\nEste é o seu convite VIP para acessar o novo painel do *RVM Designações*.\n\nPara visualizar sua aba restrita e vincular sua conta automaticamente com segurança, basta clicar no link abaixo e fazer login com o Google:\n\n🔗 ${inviteLink}\n\n_(Este link é de uso único e pessoal)_`;
                
                const waRes = await waService.sendText(pub.phone, msg);
                if (!waRes.success) {
                    setLogs(prev => [`⚠️ Falha no envio para ${pub.name} (${pub.phone})`, ...prev]);
                } else {
                    setLogs(prev => [`✅ Enviado para ${pub.name}`, ...prev]);
                    // Remove from list so user sees it shrinking
                    setTargets(prev => prev.filter(t => t.id !== pub.id));
                    setSelectedIds(prev => {
                        const n = new Set(prev);
                        n.delete(pub.id);
                        return n;
                    });
                }
            } catch (e: any) {
                setLogs(prev => [`❌ Erro no pub ${pub.name}: ${e.message}`, ...prev]);
            }
            
            setProgress(p => ({ ...p, current: i + 1 }));
            // Delay to avoid strict rate limiting
            await new Promise(r => setTimeout(r, 1200));
        }
        
        setLogs(prev => ['🎉 Lote finalizado!', ...prev]);
        setStatus('done');
    };

    if (!isOpen) return null;

    return createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', width: '90%', maxWidth: '600px', maxHeight: '90vh', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', color: '#e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, color: '#f59e0b', fontSize: '1.4rem' }}>🚀 Carga Inicial Gradual</h2>
                    <button onClick={onClose} disabled={status === 'running'} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: status === 'running' ? 'not-allowed' : 'pointer' }}>&times;</button>
                </div>

                <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '16px' }}>
                    Selecione os publicadores para receberem o convite VIP via Z-API. Recomendamos disparar lotes de 10 a 20 publicadores por vez.
                </p>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Carregando lista...</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                            <button onClick={handleSelectAll} disabled={status === 'running'} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Selecionar Todos</button>
                            <button onClick={handleSelectNone} disabled={status === 'running'} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Desmarcar Todos</button>
                            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.9rem', color: '#94a3b8' }}>
                                {selectedIds.size} / {targets.length} selecionados
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '10px', minHeight: '200px' }}>
                            {targets.length === 0 ? (
                                <div style={{ color: '#64748b', textAlign: 'center', marginTop: '40px' }}>Nenhum publicador pendente encontrado.</div>
                            ) : (
                                targets.map(t => (
                                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #1e293b' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(t.id)} 
                                            onChange={() => toggleSelection(t.id)}
                                            disabled={status === 'running'}
                                            style={{ width: '18px', height: '18px', marginRight: '12px', cursor: 'pointer' }}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 600 }}>{t.name}</span>
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t.phone}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {logs.length > 0 && (
                    <div style={{ marginTop: '16px', background: '#000', padding: '10px', borderRadius: '6px', minHeight: '100px', flexShrink: 0, overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', color: '#10b981' }}>
                        {logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button 
                        onClick={onClose} 
                        disabled={status === 'running'}
                        style={{ padding: '10px 20px', background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '6px', cursor: status === 'running' ? 'not-allowed' : 'pointer' }}
                    >
                        Fechar
                    </button>
                    <button 
                        onClick={handleDispatch}
                        disabled={status === 'running' || selectedIds.size === 0 || loading}
                        style={{ padding: '10px 24px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: (status === 'running' || selectedIds.size === 0 || loading) ? 'not-allowed' : 'pointer', opacity: (selectedIds.size === 0) ? 0.5 : 1 }}
                    >
                        {status === 'running' ? `Disparando (${progress.current}/${progress.total})...` : 'Gerar e Disparar Selecionados'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
