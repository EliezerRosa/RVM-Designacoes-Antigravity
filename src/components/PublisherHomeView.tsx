/**
 * PublisherHomeView — Tela simplificada para publicadores comuns.
 * 
 * Publicadores sem nenhuma aba admin (condition = 'Publicador', sem função SRVM)
 * veem APENAS "Minhas Designações" — sem acesso a WorkbookManager, Relatórios,
 * Admin, Territórios, Backup, Comunicação ou qualquer funcionalidade de gestão.
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { WorkbookPart } from '../types';
import { getModalidadeFromTipo } from '../constants/mappings';
import { PwaInstallBanner } from './ui/PwaInstallBanner';

interface PublisherHomeViewProps {
    onSignOut: () => void;
    userEmail: string;
}

interface PartWithDetails extends WorkbookPart {
    weekDisplay?: string;
}

export function PublisherHomeView({ onSignOut, userEmail }: PublisherHomeViewProps) {
    const { profile } = useAuth();
    const [parts, setParts] = useState<PartWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [publisherName, setPublisherName] = useState<string | null>(null);

    useEffect(() => {
        async function loadMyAssignments() {
            if (!profile?.publisher_id) {
                setLoading(false);
                return;
            }

            try {
                // Fetch publisher name
                const { data: pub } = await supabase
                    .from('publishers')
                    .select('data')
                    .eq('id', profile.publisher_id)
                    .maybeSingle();
                
                if (pub?.data) {
                    const pubData = pub.data as Record<string, unknown>;
                    setPublisherName((pubData.name as string) || profile.full_name || null);
                }

                // Fetch my upcoming assignments
                const { data: myParts, error } = await supabase
                    .from('workbook_parts')
                    .select('*')
                    .or(`data->>resolvedPublisherId.eq.${profile.publisher_id},data->>rawPublisherName.eq.${publisherName},data->>rawPublisherName.eq.${profile.full_name}`)
                    .order('data->>weekId', { ascending: true });

                if (!error && myParts) {
                    const mapped = myParts.map(p => {
                        const d = p.data as Record<string, unknown>;
                        return {
                            id: p.id,
                            weekId: (d.weekId as string) || '',
                            weekDisplay: (d.weekDisplay as string) || '',
                            date: (d.date as string) || '',
                            section: (d.section as string) || '',
                            tipoParte: (d.tipoParte as string) || '',
                            tituloParte: (d.tituloParte as string) || '',
                            descricaoParte: (d.descricaoParte as string) || '',
                            detalhesParte: (d.detalhesParte as string) || '',
                            duracao: (d.duracao as string) || '',
                            funcao: (d.funcao as string) || '',
                            horaInicio: (d.horaInicio as string) || '',
                            horaFim: (d.horaFim as string) || '',
                            rawPublisherName: (d.rawPublisherName as string) || '',
                            status: (d.status as string) || 'pending',
                            seq: (d.seq as number) || 0,
                            modalidade: (d.modalidade as string) || getModalidadeFromTipo((d.tipoParte as string) || ''),
                        } as PartWithDetails;
                    });
                    setParts(mapped);
                }
            } catch (err) {
                console.warn('[PublisherHome] Failed to load assignments:', err);
            } finally {
                setLoading(false);
            }
        }

        loadMyAssignments();
    }, [profile?.publisher_id, profile?.full_name, publisherName]);

    // Only show future/current week assignments
    const upcomingParts = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return parts.filter(p => {
            if (!p.date) return true; // show if no date
            const partDate = new Date(p.date);
            // Show assignments from this week onwards (Monday of current week)
            const dayOfWeek = today.getDay();
            const monday = new Date(today);
            monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            return partDate >= monday;
        });
    }, [parts]);

    const displayName = publisherName || profile?.full_name || userEmail.split('@')[0];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'confirmed': return { text: '✅ Confirmada', bg: '#D1FAE5', color: '#065F46' };
            case 'refused': return { text: '❌ Recusada', bg: '#FEE2E2', color: '#991B1B' };
            case 'pending': return { text: '⏳ Pendente', bg: '#FEF3C7', color: '#92400E' };
            case 'completed': return { text: '✔️ Concluída', bg: '#E0E7FF', color: '#3730A3' };
            default: return { text: status, bg: '#F3F4F6', color: '#374151' };
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
            <PwaInstallBanner />
            
            {/* Header */}
            <header style={{
                padding: '16px 24px',
                background: '#111827',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 700 }}>
                        RVM Designações
                    </h1>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        👤 {displayName}
                    </span>
                </div>
                <button
                    onClick={onSignOut}
                    style={{
                        background: 'transparent',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        borderRadius: '0.5rem',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    Sair
                </button>
            </header>

            {/* Main Content */}
            <main style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px' }}>
                <div style={{
                    background: '#111827',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '20px 24px',
                        borderBottom: '1px solid #1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>📋</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>
                                Minhas Designações
                            </h2>
                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                Suas próximas designações na Reunião Vida e Ministério
                            </p>
                        </div>
                    </div>

                    <div style={{ padding: '16px 24px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                                <p>Carregando suas designações...</p>
                            </div>
                        ) : !profile?.publisher_id ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>ℹ️</div>
                                <p>Sua conta ainda não está vinculada a um publicador.</p>
                                <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                                    Entre em contato com o SRVM para vincular seu perfil.
                                </p>
                            </div>
                        ) : upcomingParts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎉</div>
                                <p>Nenhuma designação próxima encontrada.</p>
                                <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                                    Quando você for designado, suas partes aparecerão aqui.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {upcomingParts.map(part => {
                                    const badge = getStatusBadge(part.status);
                                    return (
                                        <div
                                            key={part.id}
                                            style={{
                                                background: '#1e293b',
                                                border: '1px solid #334155',
                                                borderRadius: '10px',
                                                padding: '16px',
                                                transition: 'border-color 0.2s',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                                    📅 {part.weekDisplay || part.weekId} • {part.date || ''}
                                                </div>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: badge.bg,
                                                    color: badge.color,
                                                    fontWeight: 600,
                                                }}>
                                                    {badge.text}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' }}>
                                                {part.tituloParte}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {part.section && <span>📖 {part.section}</span>}
                                                {part.funcao && <span>🎤 {part.funcao}</span>}
                                                {part.duracao && <span>⏱️ {part.duracao}</span>}
                                                {part.horaInicio && <span>🕐 {part.horaInicio}</span>}
                                            </div>
                                            {part.descricaoParte && (
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '8px', lineHeight: 1.4 }}>
                                                    {part.descricaoParte}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Footer */}
                <div style={{
                    textAlign: 'center',
                    padding: '24px 0',
                    fontSize: '0.75rem',
                    color: '#475569',
                }}>
                    <p>Os links de confirmação enviados via WhatsApp permanecem funcionais.</p>
                    <p style={{ marginTop: '4px' }}>
                        Para dúvidas, entre em contato com o Superintendente da Reunião Vida e Ministério.
                    </p>
                </div>
            </main>
        </div>
    );
}

export default PublisherHomeView;
