import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { WorkbookPart, Publisher } from '../types';
import { checkEligibility } from '../services/eligibilityService';
import { getModalidadeFromTipo } from '../constants/mappings';
import { generateWhatsAppMessage } from '../services/s89Generator';
import { api } from '../services/api';

import { communicationService } from '../services/communicationService';
import { workbookQueryService } from '../services/workbookQueryService';
import { zapiOrchestrator } from '../services/zapiOrchestrator';

interface ReplacementPortalProps {
    partId: string;
}

interface CandidateInfo {
    publisher: Publisher;
    reason: string;
}

export function ReplacementPortal({ partId }: ReplacementPortalProps) {
    const { user, profile, isLoading: authLoading, signInWithGoogle } = useAuth();
    const [part, setPart] = useState<WorkbookPart | null>(null);
    const [allPublishers, setAllPublishers] = useState<Publisher[]>([]);
    const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [selectedName, setSelectedName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);

    const SRVM_FUNCOES = [
        'Superintendente da Reunião Vida e Ministério',
        'Ajudante do Superintendente da Reunião Vida e Ministério'
    ];

    useEffect(() => {
        if (authLoading || !user || !profile) return;
        checkAuthAndLoad();
    }, [authLoading, user, profile]);

    const checkAuthAndLoad = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Verificar se o email logado pertence a um SRVM/Ajudante
            const { data: publishers } = await supabase.from('publishers').select('id, data');
            if (!publishers) { setError('Falha ao carregar dados.'); return; }

            const userEmail = profile?.email || user?.email || '';
            const isAdmin = profile?.role === 'admin';
            const matchedPub = publishers.find((p: any) =>
                p.data?.email?.toLowerCase() === userEmail.toLowerCase() &&
                SRVM_FUNCOES.includes(p.data?.funcao)
            );

            if (!matchedPub && !isAdmin) {
                setIsAuthorized(false);
                setError(`A conta ${userEmail} não está vinculada a um Superintendente ou Ajudante da RVM.`);
                setLoading(false);
                return;
            }

            setIsAuthorized(true);

            // 2. Carregar a parte recusada
            const { data: partRow, error: partError } = await supabase
                .from('workbook_parts')
                .select('*')
                .eq('id', partId)
                .maybeSingle();

            if (partError || !partRow) {
                setError('Parte não encontrada.');
                setLoading(false);
                return;
            }

            // Mapear para o tipo WorkbookPart
            const mappedPart: WorkbookPart = {
                id: partRow.id,
                weekId: partRow.week_id,
                weekDisplay: partRow.week_display || '',
                date: partRow.date || partRow.week_id,
                section: partRow.section || '',
                tipoParte: partRow.tipo_parte || '',
                modalidade: partRow.modalidade || '',
                tituloParte: partRow.part_title || '',
                descricaoParte: partRow.description || '',
                detalhesParte: partRow.details || '',
                seq: partRow.seq || 0,
                funcao: partRow.funcao || 'Titular',
                duracao: String(partRow.duration || ''),
                horaInicio: partRow.start_time || '',
                horaFim: partRow.end_time || '',
                rawPublisherName: partRow.raw_publisher_name || '',
                resolvedPublisherName: partRow.resolved_publisher_name || '',
                resolvedPublisherId: partRow.resolved_publisher_id || '',
                status: partRow.status || '',
            };
            setPart(mappedPart);

            // 3. Rankear Top 3 candidatos
            const allPubs: Publisher[] = publishers.map((p: any) => ({
                id: p.id,
                name: p.data?.name || '',
                gender: p.data?.gender || 'brother',
                condition: p.data?.condition || 'Publicador',
                funcao: p.data?.funcao || null,
                phone: p.data?.phone || '',
                isBaptized: p.data?.isBaptized ?? true,
                isServing: p.data?.isServing ?? true,
                ageGroup: p.data?.ageGroup || 'Adulto',
                parentIds: p.data?.parentIds || [],
                isHelperOnly: p.data?.isHelperOnly ?? false,
                canPairWithNonParent: p.data?.canPairWithNonParent ?? true,
                privileges: p.data?.privileges || { canGiveTalks: false, canConductCBS: false, canReadCBS: false, canPray: false, canPreside: false },
                privilegesBySection: p.data?.privilegesBySection || { canParticipateInTreasures: true, canParticipateInMinistry: true, canParticipateInLife: true },
                availability: p.data?.availability || { mode: 'always', exceptionDates: [], availableDates: [] },
                aliases: p.data?.aliases || [],
                requestedNoParticipation: p.data?.requestedNoParticipation ?? false,
                isNotQualified: p.data?.isNotQualified ?? false,
            }));

            setAllPublishers(allPubs);

            const modalidade = mappedPart.modalidade || getModalidadeFromTipo(mappedPart.tipoParte, mappedPart.section);
            const eligible: CandidateInfo[] = [];

            for (const pub of allPubs) {
                // Não sugerir o publicador que recusou
                if (pub.id === mappedPart.resolvedPublisherId) continue;
                if (pub.requestedNoParticipation || pub.isNotQualified) continue;

                const result = checkEligibility(pub, modalidade as any, mappedPart.funcao, {
                    date: mappedPart.date,
                    secao: mappedPart.section,
                    partTitle: mappedPart.tituloParte,
                    partDescription: mappedPart.descricaoParte,
                    partDetails: mappedPart.detalhesParte,
                });

                if (result.eligible) {
                    eligible.push({
                        publisher: pub,
                        reason: result.reason || 'Elegível',
                    });
                }
            }

            // Pegar os 3 primeiros (já filtrados por elegibilidade)
            setCandidates(eligible.slice(0, 3));
        } catch (err) {
            console.error('[ReplacementPortal] Erro:', err);
            setError('Falha ao carregar dados do portal.');
        } finally {
            setLoading(false);
        }
    };

    const handleReplace = async (candidate: Publisher) => {
        if (!part) return;
        setIsSubmitting(true);
        setSelectedName(candidate.name);

        try {
            // 1. Atualizar a parte no banco
            const { error: updateError } = await supabase
                .from('workbook_parts')
                .update({
                    resolved_publisher_name: candidate.name,
                    resolved_publisher_id: candidate.id,
                    raw_publisher_name: candidate.name,
                    status: 'DESIGNADA',
                })
                .eq('id', part.id);

            if (updateError) throw updateError;

            // 2. Notificar novo designado via Z-API usando o template S-89 padrão com link correto
            if (candidate.phone) {
                const updatedPart = { ...part, resolvedPublisherName: candidate.name, resolvedPublisherId: candidate.id };
                
                let msg = '';
                try {
                    const { content } = await communicationService.prepareS89Message(
                        updatedPart as any,
                        allPublishers,
                        [], 
                        { isSubstitution: true }
                    );
                    msg = content;
                } catch (err) {
                    console.error('[ReplacementPortal] Falha ao gerar mensagem S89:', err);
                    // Fallback de segurança se prepareS89Message falhar
                    const honorific = candidate.gender === 'sister' ? 'Irmã' : 'Irmão';
                    msg = `📋 *Nova Designação — RVM*\n\n${honorific} ${candidate.name}, ` +
                        `você foi designado(a) para a parte:\n\n` +
                        `📖 *${part.tipoParte}*\n` +
                        `${part.tituloParte ? `🎯 *${part.tituloParte}*\n` : ''}` +
                        `\nPor favor, comece a se preparar. Que Jeová abençoe! 🙏`;
                }

                await supabase.functions.invoke('send-whatsapp', {
                    body: { action: 'send-text', phone: candidate.phone, message: msg }
                });
            }

            // 3. Buscar e Notificar Parceiro
            try {
                const weekParts = await workbookQueryService.getWeekParts(part.weekId);
                const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
                const partNum = partNumMatch ? partNumMatch[1] : null;

                const realSelfIdForRefusal = part.id.replace(/-(titular|ajudante)$/i, '');
                const partnerPart = weekParts.find(p => {
                    if (p.id === part.id || p.id === realSelfIdForRefusal) return false;
                    if (!p.resolvedPublisherName && !p.rawPublisherName && !p.resolvedPublisherId) return false;
                    const otherNum = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/)?.[1];
                    if (partNum && otherNum && partNum === otherNum) return p.funcao !== part.funcao;
                    return p.tipoParte === part.tipoParte && p.funcao !== part.funcao;
                });

                if (partnerPart) {
                    let partnerName = partnerPart.resolvedPublisherName || partnerPart.rawPublisherName || '';
                    if (partnerPart.resolvedPublisherId) {
                        const found = allPublishers.find(p => p.id === partnerPart.resolvedPublisherId);
                        if (found) partnerName = found.name;
                    }

                    const partnerPub = partnerName ? allPublishers.find(p => p.name.trim() === partnerName.trim()) : null;
                    if (partnerPub && partnerPub.phone) {
                        await zapiOrchestrator.dispatchPartnerReplacementAlert(
                            partnerPub.phone,
                            partnerName,
                            part.tipoParte || '',
                            part.date || '',
                            candidate.name,
                            candidate.phone || '',
                            part.funcao === 'Ajudante'
                        );
                    }
                }
            } catch (err) {
                console.error('[ReplacementPortal] Falha ao notificar parceiro:', err);
            }

            setSuccess(true);
        } catch (err) {
            console.error('[ReplacementPortal] Erro ao substituir:', err);
            setError('Falha ao registrar a substituição. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER ---

    if (authLoading) {
        return <div style={S.container}><div style={S.card}><p style={S.muted}>⏳ Carregando...</p></div></div>;
    }

    if (!user) {
        return (
            <div style={S.container}>
                <div style={S.card}>
                    <h1 style={S.title}>⚡ Portal de Substituição</h1>
                    <p style={S.muted}>Acesso exclusivo para SRVM e Ajudantes</p>
                    <button style={S.primaryBtn} onClick={() => signInWithGoogle()}>Entrar com Google</button>
                </div>
            </div>
        );
    }

    if (loading) {
        return <div style={S.container}><div style={S.card}><p style={S.muted}>⏳ Carregando dados da parte...</p></div></div>;
    }

    if (!isAuthorized || error) {
        return (
            <div style={S.container}>
                <div style={S.card}>
                    <h2 style={S.errorTitle}>🔒 {isAuthorized ? 'Erro' : 'Acesso Negado'}</h2>
                    <p style={S.muted}>{error || 'Você não tem permissão para acessar este portal.'}</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div style={S.container}>
                <div style={S.card}>
                    <h2 style={{ ...S.title, color: '#34d399' }}>✅ Substituição Concluída!</h2>
                    <p style={S.muted}><strong>{selectedName}</strong> foi designado(a) e notificado(a) via WhatsApp.</p>
                    <button style={S.closeBtn} onClick={() => window.close()}>Fechar</button>
                </div>
            </div>
        );
    }

    if (!part) return null;

    return (
        <div style={S.container}>
            <div style={S.card}>
                <h1 style={S.title}>⚡ Substituição Rápida</h1>

                {/* Parte recusada */}
                <div style={S.partBox}>
                    <p style={S.partLabel}>Parte recusada:</p>
                    <p style={S.partTitle}>{part.tipoParte}</p>
                    {part.tituloParte && <p style={S.partTheme}>"{part.tituloParte}"</p>}
                    <p style={S.partPub}>❌ {part.resolvedPublisherName || part.rawPublisherName}</p>
                </div>

                {/* Candidatos */}
                <p style={{ ...S.muted, margin: '20px 0 12px', fontWeight: 600 }}>
                    Top {candidates.length} Candidatos Elegíveis:
                </p>

                {candidates.length === 0 ? (
                    <p style={S.muted}>Nenhum candidato elegível encontrado. Use o sistema completo para designar manualmente.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {candidates.map((c, idx) => (
                            <button
                                key={c.publisher.id}
                                style={isSubmitting ? { ...S.candidateBtn, opacity: 0.5 } : S.candidateBtn}
                                disabled={isSubmitting}
                                onClick={() => handleReplace(c.publisher)}
                            >
                                <span style={S.candidateRank}>#{idx + 1}</span>
                                <span style={S.candidateName}>{c.publisher.name}</span>
                                <span style={S.candidateArrow}>→</span>
                            </button>
                        ))}
                    </div>
                )}

                <p style={{ ...S.muted, marginTop: '20px', fontSize: '0.8rem' }}>
                    Clique em um candidato para confirmar a substituição.
                </p>
            </div>
        </div>
    );
}

// --- ESTILOS INLINE (portal isolado) ---
const S: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    card: {
        width: '100%',
        maxWidth: '480px',
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '20px',
        padding: '28px 24px',
        color: '#e2e8f0',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
    },
    title: {
        margin: '0 0 8px 0',
        fontSize: '1.4rem',
        color: '#f1f5f9',
        textAlign: 'center' as const,
    },
    muted: { color: '#94a3b8', lineHeight: 1.6, textAlign: 'center' as const },
    primaryBtn: {
        display: 'block',
        width: '100%',
        marginTop: '20px',
        padding: '14px 20px',
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
    },
    closeBtn: {
        display: 'block',
        margin: '16px auto 0',
        padding: '10px 24px',
        background: '#334155',
        color: '#e2e8f0',
        border: 'none',
        borderRadius: '10px',
        fontSize: '0.9rem',
        cursor: 'pointer',
    },
    errorTitle: { color: '#fca5a5', margin: '0 0 12px 0', textAlign: 'center' as const },
    partBox: {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '14px',
        padding: '16px',
        marginTop: '16px',
    },
    partLabel: { color: '#fca5a5', fontSize: '0.8rem', margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    partTitle: { color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 4px' },
    partTheme: { color: '#94a3b8', fontStyle: 'italic', margin: '0 0 8px', fontSize: '0.9rem' },
    partPub: { color: '#fca5a5', margin: 0, fontSize: '0.9rem' },
    candidateBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        padding: '14px 16px',
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: '12px',
        color: '#e2e8f0',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        fontSize: '0.95rem',
        textAlign: 'left' as const,
    },
    candidateRank: { color: '#10b981', fontWeight: 700, fontSize: '1rem', minWidth: '28px' },
    candidateName: { flex: 1, fontWeight: 500 },
    candidateArrow: { color: '#10b981', fontSize: '1.2rem' },
};
