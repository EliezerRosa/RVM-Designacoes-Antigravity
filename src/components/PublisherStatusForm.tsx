/**
 * PublisherStatusForm — Form portal para atualização em lote de publicadores.
 *
 * Acessado via:
 *   - Portal sem auth: /?portal=publisher-form&token=<uuid>
 *   - Admin autenticado: dentro do AdminDashboard (sem token exigido)
 *
 * O token é validado contra app_settings['publisher_form_tokens'].
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Publisher, WorkbookPart } from '../types';
import { findPublisherImpediments, type ImpedimentEntry } from '../services/publisherImpedimentService';
import { PublisherImpedimentModal } from './PublisherImpedimentModal';
import { workbookManagementService } from '../services/workbookManagementService';
import { LocalNeedsQueue } from './LocalNeedsQueue';
import { SpecialEventsManager } from './SpecialEventsManager';

// ─── Token ─────────────────────────────────────────────────────────────────
/**
 * Papel do destinatário do link.
 *  - CCA: Coordenador do Corpo de Anciãos    → CRUD total
 *  - SEC: Secretário                         → CRUD total
 *  - SS:  Superintendente de Serviço         → somente leitura
 *  - SRVM: Superintendente da Reunião VM     → CRUD em "Pediu Não Participar",
 *                                              "Motivo Não Participar" e "Só Ajudante";
 *                                              somente leitura no resto
 *  - AjSRVM: Ajudante do SRVM                → idem SRVM
 *
 * Tokens antigos (sem `role`) são tratados como "CCA" (acesso total) para
 * manter compatibilidade.
 */
export type PublisherFormRole = 'CCA' | 'SEC' | 'SS' | 'SRVM' | 'AjSRVM';

export interface FormToken {
    token: string;
    label: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
    /** Papel do destinatário (define permissões dentro do form). */
    role?: PublisherFormRole;
}

/**
 * Todo link gerado em "Publicadores — Links de Form" é destinado à Comissão de Serviço
 * (CCA / SEC / SS) + Admin. Por isso ganha acesso aos módulos de Necessidades Locais
 * e Eventos Especiais. Links de Disponibilidade (outro card no admin) é que são
 * restritos a publicadores comuns.
 */

// ─── Props ──────────────────────────────────────────────────────────────────
interface PublisherStatusFormProps {
    /** Token da URL. Pode ser undefined se admin acessar diretamente. */
    token?: string;
    /** Se true, pula validação de token (admin autenticado). */
    isAdminAccess?: boolean;
    /** Loader de partes da apostila (para checar impedimentos em edicao de admin). */
    partsLoader?: () => Promise<WorkbookPart[]>;
}

// ─── Types ──────────────────────────────────────────────────────────────────
type FormSection = 'status' | 'privileges' | 'sections';

type PartialPublisher = Partial<Publisher> & {
    privileges?: Partial<Publisher['privileges']>;
    privilegesBySection?: Partial<Publisher['privilegesBySection']>;
};

// ─── Component ──────────────────────────────────────────────────────────────
export function PublisherStatusForm({ token, isAdminAccess = false, partsLoader }: PublisherStatusFormProps) {
    const [validating, setValidating] = useState(!isAdminAccess);
    const [authorized, setAuthorized] = useState(isAdminAccess);
    const [tokenInfo, setTokenInfo] = useState<FormToken | null>(null);
    const [publishers, setPublishers] = useState<Publisher[]>([]);
    const [loading, setLoading] = useState(false);
    const [changes, setChanges] = useState<Map<string, PartialPublisher>>(new Map());
    const [section, setSection] = useState<FormSection>('status');
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState<{ success: number; errors: string[] } | null>(null);
    const [search, setSearch] = useState('');
    const [pendingImpediments, setPendingImpediments] = useState<{
        impediments: ImpedimentEntry[];
        publisherName: string;
        proceedSave: () => Promise<void>;
    } | null>(null);

    // ── Modais NL + Eventos (Admin OU token de Comissão de Serviço) ─────────────────
    const [showLocalNeeds, setShowLocalNeeds] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [modalWeeks, setModalWeeks] = useState<{ weekId: string; display: string }[] | null>(null);
    const [modalDataLoading, setModalDataLoading] = useState(false);
    const [modalDataError, setModalDataError] = useState<string | null>(null);

    const canManageCommittee = authorized;

    // ── Permissões por papel ──────────────────────────────────────────────
    // Token sem role (legado) ⇒ tratado como CCA (acesso total).
    const role: PublisherFormRole | 'admin' = isAdminAccess
        ? 'admin'
        : (tokenInfo?.role ?? 'CCA');
    const isFullEditor = role === 'admin' || role === 'CCA' || role === 'SEC';
    const isRvmEditor = role === 'SRVM' || role === 'AjSRVM';
    /** Edita "Pediu Não Participar", "Motivo Não Participar" e "Só Ajudante". */
    const canEditNonParticip = isFullEditor || isRvmEditor;
    /** Edita "Em Serviço", "Não Apto" e "Motivo Não Apto". */
    const canEditOtherStatus = isFullEditor;
    /** Edita aba de Privilégios. */
    const canEditPrivileges = isFullEditor;
    /** Edita aba "Por Seção". */
    const canEditSections = isFullEditor;
    /** Pode CRUD em Necessidades Locais e Eventos Especiais (senão é só leitura). */
    const canManageNLEvents = isFullEditor;

    const ensureWeeks = async () => {
        if (modalWeeks) return;
        setModalDataLoading(true);
        setModalDataError(null);
        try {
            const { data, error } = await supabase
                .from('workbook_parts')
                .select('week_id, date')
                .order('week_id', { ascending: true });
            if (error) throw error;
            const seen = new Map<string, string>();
            for (const row of (data || []) as Array<{ week_id: string; date: string | null }>) {
                if (!row.week_id || seen.has(row.week_id)) continue;
                const year = row.date ? new Date(row.date).getFullYear() : '';
                seen.set(row.week_id, year ? `${row.week_id} (${year})` : row.week_id);
            }
            setModalWeeks(Array.from(seen.entries()).map(([weekId, display]) => ({ weekId, display })));
        } catch (err) {
            console.error('[PublisherStatusForm] Erro carregando semanas para NL/Eventos:', err);
            setModalDataError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
        } finally {
            setModalDataLoading(false);
        }
    };

    const openLocalNeeds = async () => { await ensureWeeks(); setShowLocalNeeds(true); };
    const openEvents = async () => { await ensureWeeks(); setShowEvents(true); };

    // ── Validate token ────────────────────────────────────────────────────
    useEffect(() => {
        if (isAdminAccess) return;
        if (!token) { setValidating(false); return; }

        (async () => {
            try {
                const tokens = await api.getSetting<FormToken[]>('publisher_form_tokens', []);
                const found = tokens.find(t => t.token === token && t.active);
                if (found) { setAuthorized(true); setTokenInfo(found); }
            } catch (err) {
                console.error('[PublisherStatusForm] Token validation error:', err);
            } finally {
                setValidating(false);
            }
        })();
    }, [token, isAdminAccess]);

    // ── Load publishers ───────────────────────────────────────────────────
    useEffect(() => {
        if (!authorized) return;
        setLoading(true);
        api.loadPublishers()
            .then(pubs => setPublishers([...pubs].sort((a, b) => a.name.localeCompare(b.name, 'pt'))))
            .catch(err => console.error('[PublisherStatusForm] Load error:', err))
            .finally(() => setLoading(false));
    }, [authorized]);

    // ── Change tracking ───────────────────────────────────────────────────
    const setField = useCallback((id: string, field: keyof Publisher, value: unknown) => {
        setChanges(prev => {
            const next = new Map(prev);
            next.set(id, { ...next.get(id), [field]: value });
            return next;
        });
    }, []);

    const setNested = useCallback((
        id: string,
        parent: 'privileges' | 'privilegesBySection',
        field: string,
        value: boolean
    ) => {
        setChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(id) || {};
            const pub = publishers.find(p => p.id === id);
            if (!pub) return prev;
            const parentVal = (existing[parent] as Record<string, unknown>) || { ...(pub[parent] as Record<string, unknown>) };
            next.set(id, { ...existing, [parent]: { ...parentVal, [field]: value } });
            return next;
        });
    }, [publishers]);

    const getEffective = useCallback((pub: Publisher): Publisher => {
        const delta = changes.get(pub.id);
        if (!delta) return pub;
        return {
            ...pub,
            ...delta,
            privileges: delta.privileges
                ? { ...pub.privileges, ...delta.privileges }
                : pub.privileges,
            privilegesBySection: delta.privilegesBySection
                ? { ...pub.privilegesBySection, ...delta.privilegesBySection }
                : pub.privilegesBySection,
        };
    }, [changes]);

    // ── Save batch ────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (changes.size === 0) return;

        // Verificar impedimentos se admin e partsLoader fornecido
        if (partsLoader && isAdminAccess) {
            const allParts = await partsLoader();
            const todayWeekId = new Date().toISOString().slice(0, 10);
            for (const [id] of Array.from(changes.entries())) {
                const original = publishers.find(p => p.id === id);
                if (!original) continue;
                const updated = getEffective(original);
                const impediments = findPublisherImpediments(original, updated, allParts, publishers, todayWeekId);
                if (impediments.length > 0) {
                    setPendingImpediments({
                        impediments,
                        publisherName: original.name,
                        proceedSave: async () => { setPendingImpediments(null); await doSave(); },
                    });
                    return;
                }
            }
        }

        await doSave();
    };

    const doSave = async () => {
        setSaving(true);
        setSaveResult(null);

        const ids = Array.from(changes.keys());
        let success = 0;
        const errors: string[] = [];

        await Promise.all(ids.map(async id => {
            const original = publishers.find(p => p.id === id);
            if (!original) return;
            const updated = getEffective(original);
            try {
                await api.updatePublisher(updated);
                setPublishers(prev => prev.map(p => p.id === id ? updated : p));
                success++;
            } catch {
                errors.push(original.name);
            }
        }));

        setChanges(new Map());
        setSaving(false);
        setSaveResult({ success, errors });
        setTimeout(() => setSaveResult(null), 5000);
    };

    // ── Render helpers ────────────────────────────────────────────────────
    const filtered = publishers.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );
    const changedCount = changes.size;

    // ── States: validating / unauthorized ────────────────────────────────
    if (validating) {
        return (
            <div style={portalWrap}>
                <div style={card}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                    <p style={{ color: '#94A3B8' }}>Validando acesso...</p>
                </div>
            </div>
        );
    }

    if (!authorized) {
        return (
            <div style={portalWrap}>
                <div style={card}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔒</div>
                    <h2 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Acesso não autorizado</h2>
                    <p style={{ color: '#94A3B8', margin: 0 }}>
                        Este link é inválido, expirou ou foi revogado. Solicite um novo link ao administrador.
                    </p>
                </div>
            </div>
        );
    }

    // ── Main form ────────────────────────────────────────────────────────
    return (
        <>
        <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{
                background: '#1E293B',
                color: 'white',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>📋 Atualização de Publicadores</div>
                    {tokenInfo && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                            Link: <strong style={{ color: '#60A5FA' }}>{tokenInfo.label}</strong>
                            &nbsp;·&nbsp;gerado em {new Date(tokenInfo.createdAt).toLocaleDateString('pt-BR')}
                            {tokenInfo.role && (
                                <>&nbsp;·&nbsp;<strong style={{ color: '#FBBF24' }}>Papel: {tokenInfo.role}</strong></>
                            )}
                        </div>
                    )}
                    {isAdminAccess && !tokenInfo && (
                        <div style={{ fontSize: '11px', color: '#10B981', marginTop: '2px' }}>Acesso de Administrador</div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {canManageCommittee && (
                        <>
                            <button
                                onClick={openLocalNeeds}
                                disabled={modalDataLoading}
                                title={canManageNLEvents
                                    ? 'Gerenciar fila de Necessidades Locais'
                                    : 'Visualizar fila de Necessidades Locais (somente leitura)'}
                                style={{
                                    background: '#F59E0B', color: 'white', border: 'none',
                                    borderRadius: '8px', padding: '8px 14px', fontWeight: 600,
                                    fontSize: '13px', cursor: modalDataLoading ? 'wait' : 'pointer',
                                    opacity: modalDataLoading ? 0.7 : 1,
                                }}
                            >
                                📋 Necessidades Locais
                            </button>
                            <button
                                onClick={openEvents}
                                disabled={modalDataLoading}
                                title={canManageNLEvents
                                    ? 'Gerenciar Eventos Especiais'
                                    : 'Visualizar Eventos Especiais (somente leitura)'}
                                style={{
                                    background: '#8B5CF6', color: 'white', border: 'none',
                                    borderRadius: '8px', padding: '8px 14px', fontWeight: 600,
                                    fontSize: '13px', cursor: modalDataLoading ? 'wait' : 'pointer',
                                    opacity: modalDataLoading ? 0.7 : 1,
                                }}
                            >
                                🎉 Eventos Especiais
                            </button>
                        </>
                    )}
                    {changedCount > 0 && (
                        <span style={{
                            background: '#F59E0B',
                            color: '#1C1917',
                            borderRadius: '12px',
                            padding: '2px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                        }}>
                            {changedCount} alteração{changedCount !== 1 ? 'ões' : ''} pendente{changedCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={changedCount === 0 || saving}
                        style={{
                            background: changedCount > 0 && !saving ? '#4F46E5' : '#334155',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: changedCount > 0 && !saving ? 'pointer' : 'not-allowed',
                            opacity: changedCount === 0 ? 0.5 : 1,
                            transition: 'background 0.2s',
                        }}
                    >
                        {saving ? '⏳ Salvando...' : `💾 Salvar${changedCount > 0 ? ` (${changedCount})` : ''}`}
                    </button>
                </div>
            </div>

            {/* Save result toast */}
            {saveResult && (
                <div style={{
                    background: saveResult.errors.length === 0 ? '#D1FAE5' : '#FEF3C7',
                    color: saveResult.errors.length === 0 ? '#065F46' : '#92400E',
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderBottom: '1px solid',
                    borderColor: saveResult.errors.length === 0 ? '#A7F3D0' : '#FDE68A',
                }}>
                    {saveResult.errors.length === 0
                        ? `✅ ${saveResult.success} publicador(es) atualizado(s) com sucesso!`
                        : `⚠️ ${saveResult.success} salvo(s), ${saveResult.errors.length} com erro: ${saveResult.errors.join(', ')}`}
                </div>
            )}

            {modalDataError && canManageCommittee && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 20px', fontSize: '12px', fontWeight: 600 }}>
                    ⚠️ {modalDataError}
                </div>
            )}

            <div style={{ padding: '16px 20px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="🔍 Filtrar publicador..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '7px 12px',
                            fontSize: '13px',
                            width: '220px',
                            outline: 'none',
                        }}
                    />
                    <div style={{ display: 'flex', background: '#E2E8F0', borderRadius: '8px', padding: '2px' }}>
                        {(
                            [
                                { id: 'status' as FormSection, label: '🔴 Status de Participação' },
                                { id: 'privileges' as FormSection, label: '⭐ Privilégios' },
                                { id: 'sections' as FormSection, label: '📚 Por Seção' },
                            ] as const
                        ).map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setSection(tab.id)}
                                style={{
                                    background: section === tab.id ? '#4F46E5' : 'transparent',
                                    color: section === tab.id ? 'white' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: 'auto' }}>
                        {filtered.length} publicador{filtered.length !== 1 ? 'es' : ''}
                    </span>
                </div>

                {/* Legend */}
                <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px', display: 'flex', gap: '16px' }}>
                    <span>🟡 Linha alterada (ainda não salva)</span>
                    <span>✅ Toggle ativo</span>
                    <span>☐ Toggle inativo</span>
                </div>

                {/* Table */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                        Carregando publicadores...
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                                    <th style={thStyle}>Publicador</th>
                                    {section === 'status' && <>
                                        <th style={thStyle}>Em Serviço</th>
                                        <th style={thStyle}>Não Apto</th>
                                        <th style={{ ...thStyle, minWidth: '140px' }}>Motivo (Não Apto)</th>
                                        <th style={thStyle}>Pediu Não Participar</th>
                                        <th style={{ ...thStyle, minWidth: '140px' }}>Motivo (Não Participar)</th>
                                        <th style={thStyle}>Só Ajudante</th>
                                    </>}
                                    {section === 'privileges' && <>
                                        <th style={thStyle}>Presidir</th>
                                        <th style={thStyle}>Disc. Ensino</th>
                                        <th style={thStyle}>Disc. Estudante</th>
                                        <th style={thStyle}>Oração</th>
                                        <th style={thStyle}>Leitor EBC</th>
                                        <th style={thStyle}>Dirigir EBC</th>
                                    </>}
                                    {section === 'sections' && <>
                                        <th style={thStyle}>📖 Tesouros</th>
                                        <th style={thStyle}>🌾 Ministério</th>
                                        <th style={thStyle}>❤️ Vida Cristã</th>
                                    </>}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((pub, idx) => {
                                    const eff = getEffective(pub);
                                    const isDirty = changes.has(pub.id);
                                    const rowBg = isDirty
                                        ? '#FFFBEB'
                                        : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

                                    return (
                                        <tr key={pub.id} style={{ background: rowBg, borderBottom: '1px solid #F1F5F9' }}>
                                            {/* Name */}
                                            <td style={{ ...tdStyle, fontWeight: isDirty ? 700 : 400, color: isDirty ? '#92400E' : '#1E293B', minWidth: '160px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {isDirty && <span style={{ fontSize: '10px', color: '#F59E0B' }}>●</span>}
                                                    {eff.name}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
                                                    {eff.condition} · {eff.gender === 'brother' ? '👨' : '👩'}
                                                </div>
                                            </td>

                                            {/* ── Status de Participação ─────────────────────── */}
                                            {section === 'status' && <>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={eff.isServing !== false}
                                                        onChange={v => setField(pub.id, 'isServing', v)}
                                                        activeColor="#10B981"
                                                        disabled={!canEditOtherStatus}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.isNotQualified}
                                                        onChange={v => setField(pub.id, 'isNotQualified', v)}
                                                        activeColor="#EF4444"
                                                        disabled={!canEditOtherStatus}
                                                    />
                                                </td>
                                                <td style={tdStyle}>
                                                    <input
                                                        type="text"
                                                        placeholder="Motivo..."
                                                        value={eff.notQualifiedReason || ''}
                                                        onChange={e => setField(pub.id, 'notQualifiedReason', e.target.value)}
                                                        disabled={!canEditOtherStatus || !eff.isNotQualified}
                                                        style={reasonInputStyle(!canEditOtherStatus || !eff.isNotQualified)}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.requestedNoParticipation}
                                                        onChange={v => setField(pub.id, 'requestedNoParticipation', v)}
                                                        activeColor="#F59E0B"
                                                        disabled={!canEditNonParticip}
                                                    />
                                                </td>
                                                <td style={tdStyle}>
                                                    <input
                                                        type="text"
                                                        placeholder="Motivo..."
                                                        value={eff.noParticipationReason || ''}
                                                        onChange={e => setField(pub.id, 'noParticipationReason', e.target.value)}
                                                        disabled={!canEditNonParticip || !eff.requestedNoParticipation}
                                                        style={reasonInputStyle(!canEditNonParticip || !eff.requestedNoParticipation)}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.isHelperOnly}
                                                        onChange={v => setField(pub.id, 'isHelperOnly', v)}
                                                        activeColor="#F59E0B"
                                                        disabled={!canEditNonParticip}
                                                    />
                                                </td>
                                            </>}

                                            {/* ── Privilégios ────────────────────────────────── */}
                                            {section === 'privileges' && <>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privileges?.canPreside}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canPreside', v)}
                                                        activeColor="#4F46E5"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privileges?.canGiveTalks}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canGiveTalks', v)}
                                                        activeColor="#4F46E5"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={eff.privileges?.canGiveStudentTalks !== false}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canGiveStudentTalks', v)}
                                                        activeColor="#6366F1"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privileges?.canPray}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canPray', v)}
                                                        activeColor="#4F46E5"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privileges?.canReadCBS}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canReadCBS', v)}
                                                        activeColor="#4F46E5"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privileges?.canConductCBS}
                                                        onChange={v => setNested(pub.id, 'privileges', 'canConductCBS', v)}
                                                        activeColor="#4F46E5"
                                                        disabled={!canEditPrivileges}
                                                    />
                                                </td>
                                            </>}

                                            {/* ── Por Seção ──────────────────────────────────── */}
                                            {section === 'sections' && <>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privilegesBySection?.canParticipateInTreasures}
                                                        onChange={v => setNested(pub.id, 'privilegesBySection', 'canParticipateInTreasures', v)}
                                                        activeColor="#374151"
                                                        disabled={!canEditSections}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privilegesBySection?.canParticipateInMinistry}
                                                        onChange={v => setNested(pub.id, 'privilegesBySection', 'canParticipateInMinistry', v)}
                                                        activeColor="#92400E"
                                                        disabled={!canEditSections}
                                                    />
                                                </td>
                                                <td style={tdCenter}>
                                                    <Toggle
                                                        value={!!eff.privilegesBySection?.canParticipateInLife}
                                                        onChange={v => setNested(pub.id, 'privilegesBySection', 'canParticipateInLife', v)}
                                                        activeColor="#991B1B"
                                                        disabled={!canEditSections}
                                                    />
                                                </td>
                                            </>}
                                        </tr>
                                    );
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '13px' }}>
                                            Nenhum publicador encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer */}
                {changedCount > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                background: saving ? '#334155' : '#4F46E5',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 24px',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: saving ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {saving ? '⏳ Salvando...' : `💾 Salvar ${changedCount} alteração${changedCount !== 1 ? 'ões' : ''} em lote`}
                        </button>
                    </div>
                )}
            </div>
        </div>
        {pendingImpediments && (
            <PublisherImpedimentModal
                publisherName={pendingImpediments.publisherName}
                impediments={pendingImpediments.impediments}
                onConfirmAndCancel={async () => {
                    for (const { part } of pendingImpediments.impediments) {
                        try { await workbookManagementService.updatePart(part.id, { resolvedPublisherName: '', status: 'PENDENTE' }); } catch { /* melhor esforço */ }
                    }
                    await pendingImpediments.proceedSave();
                }}
                onSaveOnly={() => { pendingImpediments.proceedSave(); }}
                onCancel={() => { setPendingImpediments(null); }}
            />
        )}

        {showLocalNeeds && canManageCommittee && (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 9000,
            }}>
                <LocalNeedsQueue
                    publishers={publishers.map(p => ({ id: p.id, name: p.name, condition: p.condition as string }))}
                    availableWeeks={modalWeeks ?? []}
                    onClose={() => setShowLocalNeeds(false)}
                    readOnly={!canManageNLEvents}
                />
            </div>
        )}

        {showEvents && canManageCommittee && (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 9000,
            }}>
                <SpecialEventsManager
                    availableWeeks={modalWeeks ?? []}
                    onClose={() => setShowEvents(false)}
                    readOnly={!canManageNLEvents}
                />
            </div>
        )}
        </>
    );
}

// ─── Toggle Component ────────────────────────────────────────────────────────
function Toggle({
    value,
    onChange,
    activeColor = '#4F46E5',
    disabled = false,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    activeColor?: string;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={() => { if (!disabled) onChange(!value); }}
            disabled={disabled}
            style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                border: 'none',
                background: value ? activeColor : '#CBD5E1',
                cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: disabled ? 0.55 : 1,
            }}
            title={disabled
                ? 'Somente leitura — você não tem permissão para alterar este campo.'
                : (value ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar')}
        >
            <span style={{
                position: 'absolute',
                top: '2px',
                left: value ? '18px' : '2px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                transition: 'left 0.2s',
                display: 'block',
            }} />
        </button>
    );
}

// ─── Shared Styles ───────────────────────────────────────────────────────────
const portalWrap: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0F172A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
};

const card: React.CSSProperties = {
    background: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '32px',
    textAlign: 'center',
    maxWidth: '480px',
    width: '100%',
};

const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    padding: '7px 12px',
    verticalAlign: 'middle',
};

const tdCenter: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'center',
};

const reasonInputStyle = (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    border: `1px solid ${disabled ? '#E2E8F0' : '#CBD5E1'}`,
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    color: disabled ? '#94A3B8' : '#1E293B',
    background: disabled ? '#F8FAFC' : '#FFFFFF',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
});
