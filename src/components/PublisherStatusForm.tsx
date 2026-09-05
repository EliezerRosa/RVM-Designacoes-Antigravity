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
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Publisher, WorkbookPart } from '../types';
import { findPublisherImpediments, type ImpedimentEntry } from '../services/publisherImpedimentService';
import { reflectPublisherImpediments } from '../services/publisherPrivilegeReflectionService';
import { PublisherImpedimentModal } from './PublisherImpedimentModal';
import { setProfileAuthor } from '../services/profileAuthor';
import { LocalNeedsQueue } from './LocalNeedsQueue';
import { SpecialEventsManager } from './SpecialEventsManager';
import { PublisherFormTutorial, tutorialSeenKey } from './PublisherFormTutorial';
import { VideoTutorialModal } from './VideoTutorialModal';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import {
    fetchPublisherProfileHistory,
    indexHistoryByPublisher,
    resolveLastChangeForSection,
    type ProfileHistoryRecord,
} from '../services/publisherHistoryService';
import { PublisherStatusHistoryTooltip } from './PublisherStatusHistoryTooltip';

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
    /** UUID na tabela publisher_form_tokens (opcional p/ compat com legado). */
    id?: string;
    token: string;
    label: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
    /** Papel do destinatário (define permissões dentro do form). */
    role?: PublisherFormRole;
    /** ID do publicador titular amarrado server-side */
    publisherId?: string | null;
    /** Nome do publicador titular */
    publisherName?: string | null;
    /** E-mail vinculado server-side */
    boundEmail?: string | null;
    /** Última vez que a RPC validou esse token (preenchido pelo admin). */
    lastUsedAt?: string | null;
    /** Total de validações bem-sucedidas (preenchido pelo admin). */
    useCount?: number;
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
    partsLoader?: () => Promise<WorkbookPart[]>;    /** Se true, Eventos Especiais exibe/cria apenas anuncio/notificacao. */
    announcementsOnly?: boolean;}

// ─── Types ──────────────────────────────────────────────────────────────────
type FormSection = 'status' | 'privileges' | 'sections';

export type ActingRole = 'CCA' | 'SEC' | 'SRVM' | 'CS' | 'Admin';

type PartialPublisher = Partial<Publisher> & {
    privileges?: Partial<Publisher['privileges']>;
    privilegesBySection?: Partial<Publisher['privilegesBySection']>;
};

// ─── Component ──────────────────────────────────────────────────────────────
export function PublisherStatusForm({ token, isAdminAccess = false, partsLoader, announcementsOnly = false }: PublisherStatusFormProps) {
    const { user, isAuthenticated, isLoading: authLoading, signInWithGoogle, signOut } = useAuth();
    const [validating, setValidating] = useState(!isAdminAccess);
    const [authorized, setAuthorized] = useState(isAdminAccess);
    const [tokenInfo, setTokenInfo] = useState<FormToken | null>(null);
    const [authError, setAuthError] = useState<{
        type: 'email_mismatch' | 'invalid_or_expired' | 'generic';
        callerEmail?: string;
        expectedEmail?: string;
        expectedPublisherName?: string;
        label?: string;
    } | null>(null);
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

    // ── Papel Atuante em Modo Admin (CCA / SEC / SRVM / CS / Admin) ────────────────
    const [actingRole, setActingRole] = useState<ActingRole>(() => {
        try {
            const saved = localStorage.getItem('rvm_status_form_acting_role');
            if (saved && ['CCA', 'SEC', 'SRVM', 'CS', 'Admin'].includes(saved)) {
                return saved as ActingRole;
            }
        } catch {}
        return 'CCA';
    });

    // ── Histórico de Alterações de Perfil & Status ──────────────────────────────────
    const [historyMap, setHistoryMap] = useState<Map<string, ProfileHistoryRecord[]>>(new Map());
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHardcodedRulesModal, setShowHardcodedRulesModal] = useState(false);

    // ── Modais NL + Eventos (Admin OU token de Comissão de Serviço) ─────────────────
    const [showLocalNeeds, setShowLocalNeeds] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showVideoTutorial, setShowVideoTutorial] = useState(false);
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
    /** Edita "Pediu Não Participar", "Motivo Não Participar" e "Só Ajudante".
     *  Por regra: APENAS SRVM e Aj SRVM (e admin). CCA/SEC apenas visualizam. */
    const canEditNonParticip = role === 'admin' || isRvmEditor;
    /** Edita "Em Serviço", "Não Apto" e "Motivo Não Apto". */
    const canEditOtherStatus = isFullEditor;
    /** Edita aba de Privilégios. */
    const canEditPrivileges = isFullEditor;
    /** Edita aba "Por Seção". */
    const canEditSections = isFullEditor;
    /** Pode CRUD em Necessidades Locais e Eventos Especiais (senão é só leitura).
     *  Em modo CS (announcementsOnly) a role 'CS' também tem acesso de edição. */
    const canManageNLEvents = isFullEditor || (announcementsOnly && (role as string) === 'CS');

    /** Edição e correção manual do autor do histórico: ESTRITAMENTE Admin. Os demais apenas visualizam. */
    const canEditAuthor = isAdminAccess || role === 'admin';

    const ensureWeeks = async () => {
        if (modalWeeks) return;
        setModalDataLoading(true);
        setModalDataError(null);
        try {
            // Fase 1 RLS hardening: RPC SECURITY DEFINER que valida token
            // OU admin bypass; substitui SELECT direto em workbook_parts
            // (que será restrito na Fase 3 para anon).
            const { data, error } = await supabase.rpc('list_workbook_weeks_for_publisher_form', {
                p_token: token || null,
            });
            if (error) throw error;
            const rows = (data || []) as Array<{ week_id: string; display: string }>;
            setModalWeeks(rows.map(r => ({ weekId: r.week_id, display: r.display })));
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
    // A validação acontece via RPC `authorize_publisher_form_token` (SECURITY DEFINER).
    // Para segurança estrita da Comissão de Serviço:
    // 1. Exige usuário autenticado via Google (auth.uid()).
    // 2. Compara o e-mail logado com bound_email associado ao token/publisher_id.
    // 3. Força a identidade do autor a ser o publisher_id amarrado no banco de dados.
    useEffect(() => {
        if (isAdminAccess) return;
        if (!token) {
            setValidating(false);
            return;
        }
        if (authLoading) return; // Aguarda carregar sessão do usuário

        // Se não autenticado via Google, a UI exibirá o card de login com Google
        if (!isAuthenticated) {
            setValidating(false);
            return;
        }

        (async () => {
            setValidating(true);
            setAuthError(null);
            try {
                // Lê o hint de identidade da URL (?u=<publisher_id>) para compatibilidade
                const userHint = new URLSearchParams(window.location.search).get('u') || null;
                const { data, error } = await supabase.rpc('authorize_publisher_form_token', {
                    p_token: token,
                    p_user_publisher_id: userHint,
                    p_user_publisher_name: null,
                    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
                });
                if (error) {
                    console.error('[PublisherStatusForm] RPC error:', error);
                    setAuthError({ type: 'generic' });
                    setAuthorized(false);
                    return;
                }
                const result = data as {
                    authorized?: boolean;
                    reason?: string;
                    token?: string;
                    label?: string;
                    role?: PublisherFormRole;
                    created_at?: string;
                    publisher_id?: string | null;
                    publisher_name?: string | null;
                    bound_email?: string | null;
                    caller_email?: string | null;
                    expected_email?: string | null;
                    expected_publisher_name?: string | null;
                };

                if (result?.authorized) {
                    setAuthorized(true);
                    setTokenInfo({
                        token: result.token || token,
                        label: result.label || '',
                        role: result.role,
                        publisherId: result.publisher_id,
                        publisherName: result.publisher_name,
                        boundEmail: result.bound_email,
                        createdAt: result.created_at || new Date().toISOString(),
                        createdBy: '',
                        active: true,
                    });
                    setAuthError(null);
                } else {
                    setAuthorized(false);
                    if (result?.reason === 'email_mismatch') {
                        setAuthError({
                            type: 'email_mismatch',
                            callerEmail: result.caller_email || user?.email || '',
                            expectedEmail: result.expected_email || '',
                            expectedPublisherName: result.expected_publisher_name || result.label || '',
                            label: result.label,
                        });
                    } else {
                        setAuthError({
                            type: 'invalid_or_expired',
                            label: result?.label,
                        });
                    }
                    console.warn('[PublisherStatusForm] Token rejeitado:', result?.reason);
                }
            } catch (err) {
                console.error('[PublisherStatusForm] Token validation error:', err);
                setAuthError({ type: 'generic' });
                setAuthorized(false);
            } finally {
                setValidating(false);
            }
        })();
    }, [token, isAdminAccess, authLoading, isAuthenticated, user?.email]);

    // ── Load publishers ───────────────────────────────────────────────────
    useEffect(() => {
        if (!authorized) return;
        setLoading(true);
        api.loadPublishers()
            .then(pubs => setPublishers([...pubs].sort((a, b) => a.name.localeCompare(b.name, 'pt'))))
            .catch(err => console.error('[PublisherStatusForm] Load error:', err))
            .finally(() => setLoading(false));
    }, [authorized]);

    // ── Load profile history (audit trail) ────────────────────────────────
    const loadHistory = useCallback(async () => {
        if (!authorized) return;
        setHistoryLoading(true);
        try {
            const records = await fetchPublisherProfileHistory(tokenInfo?.token || token || null);
            setHistoryMap(indexHistoryByPublisher(records));
        } catch (err) {
            console.error('[PublisherStatusForm] Erro ao carregar histórico:', err);
        } finally {
            setHistoryLoading(false);
        }
    }, [authorized, tokenInfo?.token, token]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // ── Resolução de Titulares e Autor Atuante ───────────────────────────
    const ccaPub = publishers.find(p => p.funcao === 'Coordenador do Corpo de Anciãos' || p.funcao === 'Coordenador');
    const secPub = publishers.find(p => p.funcao === 'Secretário' || p.funcao === 'Secretario');
    const srvmPub = publishers.find(p => p.funcao === 'Superintendente da Reunião Vida e Ministério' || p.funcao === 'Superintendente RVM');

    const getActingAuthorLabel = useCallback((roleToUse: ActingRole): string => {
        if (roleToUse === 'CCA') return ccaPub ? `CCA: ${ccaPub.name}` : 'CCA: Israel Vieira';
        if (roleToUse === 'SEC') return secPub ? `SEC: ${secPub.name}` : 'SEC: Marcos Rogério';
        if (roleToUse === 'SRVM') return srvmPub ? `SRVM: ${srvmPub.name}` : 'SRVM: Edmardo Queiroz';
        if (roleToUse === 'CS') return 'Comissão de Serviço';
        return 'Admin';
    }, [ccaPub, secPub, srvmPub]);

    // ── Set profile author (audit context) ────────────────────────────────
    // Admin: usa o papel teocrático selecionado (CCA/SEC/SRVM/CS/Admin). Portal: usa role+label do token.
    useEffect(() => {
        if (!authorized) return;
        if (isAdminAccess) {
            const authorLabel = getActingAuthorLabel(actingRole);
            const authorId = actingRole === 'CCA' ? (ccaPub?.id || null)
                : actingRole === 'SEC' ? (secPub?.id || null)
                : actingRole === 'SRVM' ? (srvmPub?.id || null)
                : null;
            setProfileAuthor({
                source: 'admin_app',
                authorLabel,
                authorId,
                token: null,
            });
            return;
        }
        if (!tokenInfo) return;
        const roleLbl = tokenInfo.role ?? 'CCA';
        const userHint = new URLSearchParams(window.location.search).get('u') || null;
        // Prioridade estrita para o publisherId amarrado no banco de dados
        const authorId = tokenInfo.publisherId || userHint;
        const userPub = authorId ? publishers.find(p => p.id === authorId) : null;
        const authorName = tokenInfo.publisherName || (userPub ? userPub.name : null);
        const nameSuffix = authorName ? ` (${authorName})` : '';
        const tail = tokenInfo.label ? `: ${tokenInfo.label}` : '';
        setProfileAuthor({
            source: 'publisher_form_portal',
            authorLabel: `${roleLbl}${nameSuffix} (portal)${tail}`,
            authorId,
            token: tokenInfo.token,
        });
    }, [authorized, isAdminAccess, actingRole, ccaPub, secPub, srvmPub, getActingAuthorLabel, tokenInfo, publishers]);

    // ── Auto-open tutorial na 1ª visita por papel ───────────────────────────
    // NOTA: Pulamos auto-open quando isAdminAccess porque o passo 'role-badge'
    // do tour não tem âncora em modo admin (badge só renderiza com tokenInfo)
    // e o driver.js fica com backdrop opaco e popover sem alvo, parecendo
    // tela em branco. O botão ❓ Tutorial continua disponível manualmente.
    useEffect(() => {
        if (!authorized) return;
        if (isAdminAccess) return;
        if (!tokenInfo) return;
        try {
            const seen = localStorage.getItem(tutorialSeenKey(role));
            if (!seen) {
                const t = setTimeout(() => setShowTutorial(true), 600);
                return () => clearTimeout(t);
            }
        } catch { /* ignore */ }
    }, [authorized, tokenInfo, isAdminAccess, role]);

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
            const parentVal = (existing[parent] as unknown as Record<string, unknown>) || { ...(pub[parent] as unknown as Record<string, unknown>) };
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
            const todayWeekId = getTodayWeekIdLocal();
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

        // Recarrega histórico para atualizar tooltip e autor imediatamente
        if (success > 0) {
            loadHistory();
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────
    const filtered = publishers.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );
    const changedCount = changes.size;

    // ── States: validating / login / unauthorized ────────────────────────────────
    if (validating || (token && authLoading)) {
        return (
            <div style={portalWrap}>
                <div style={card}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                    <p style={{ color: '#94A3B8' }}>Validando acesso e credenciais...</p>
                </div>
            </div>
        );
    }

    // Se o token existe mas o usuário não está autenticado com o Google
    if (!isAdminAccess && token && !isAuthenticated) {
        return (
            <div style={portalWrap}>
                <div style={{ ...card, maxWidth: '440px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛡️</div>
                    <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '20px' }}>Comissão de Serviço</h2>
                    <p style={{ color: '#94A3B8', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
                        Este formulário gerencia dados sensíveis da congregação. Para segurança e auditoria teocrática, autentique-se com sua Conta Google.
                    </p>
                    <button
                        onClick={() => signInWithGoogle()}
                        style={{
                            background: '#FFFFFF',
                            color: '#1E293B',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '12px 20px',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            width: '100%',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                            transition: 'transform 0.1s ease',
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Entrar com Google
                    </button>
                </div>
            </div>
        );
    }

    // Se a conta Google logada não bate com o e-mail autorizado do titular do token
    if (authError?.type === 'email_mismatch') {
        return (
            <div style={portalWrap}>
                <div style={{ ...card, maxWidth: '500px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
                    <h2 style={{ color: '#F87171', margin: '0 0 8px', fontSize: '18px' }}>Conta Google Não Autorizada</h2>
                    <p style={{ color: '#CBD5E1', fontSize: '13px', lineHeight: 1.5, margin: '0 0 14px' }}>
                        Este link é restrito e pertence exclusivamente ao irmão{' '}
                        <strong style={{ color: '#FBBF24' }}>{authError.expectedPublisherName || authError.label}</strong>.
                    </p>
                    <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', padding: '12px', textAlign: 'left', marginBottom: '18px', fontSize: '12px' }}>
                        <div style={{ color: '#94A3B8', marginBottom: '4px' }}>
                            E-mail conectado: <strong style={{ color: '#F87171' }}>{authError.callerEmail}</strong>
                        </div>
                        <div style={{ color: '#94A3B8' }}>
                            E-mail autorizado: <strong style={{ color: '#34D399' }}>{authError.expectedEmail}</strong>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button
                            onClick={async () => {
                                await signOut();
                                await signInWithGoogle();
                            }}
                            style={{
                                background: '#3B82F6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 18px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Trocar de Conta Google
                        </button>
                        <button
                            onClick={() => signOut()}
                            style={{
                                background: '#334155',
                                color: '#CBD5E1',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Sair
                        </button>
                    </div>
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
        <div style={{ minHeight: '100vh', width: '100%', flex: 1, background: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header Sticky */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#1E293B',
                color: 'white',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>📋 Atualização de Publicadores</div>
                    {tokenInfo && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                            Link: <strong style={{ color: '#60A5FA' }}>{tokenInfo.label}</strong>
                            &nbsp;·&nbsp;gerado em {new Date(tokenInfo.createdAt).toLocaleDateString('pt-BR')}
                            {tokenInfo.role && (
                                <>&nbsp;·&nbsp;<strong data-tour="role-badge" style={{ color: '#FBBF24' }}>Papel: {tokenInfo.role}</strong></>
                            )}
                            {user && !isAdminAccess && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
                                    <span>👤 <strong style={{ color: '#38BDF8' }}>{user.email}</strong></span>
                                    <button
                                        onClick={() => signOut()}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #475569',
                                            color: '#94A3B8',
                                            borderRadius: '4px',
                                            padding: '1px 5px',
                                            fontSize: '10px',
                                            cursor: 'pointer',
                                        }}
                                        title="Sair desta conta Google"
                                    >
                                        Sair
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {isAdminAccess && !tokenInfo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                                👤 Registrar alterações como:
                            </span>
                            <select
                                value={actingRole}
                                onChange={e => {
                                    const nextRole = e.target.value as ActingRole;
                                    setActingRole(nextRole);
                                    try {
                                        localStorage.setItem('rvm_status_form_acting_role', nextRole);
                                    } catch {}
                                }}
                                style={{
                                    background: '#0F172A',
                                    color: '#F8FAFC',
                                    border: '1px solid #3B82F6',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }}
                                title="Selecione em nome de quem as alterações de status, privilégios ou seções serão registradas no histórico teocrático de auditoria."
                            >
                                <option value="CCA">👑 CCA: {ccaPub?.name || 'Israel Vieira'} (Deliberação Pastoral)</option>
                                <option value="SEC">📋 SEC: {secPub?.name || 'Marcos Rogério'} (Secretaria)</option>
                                <option value="SRVM">📖 SRVM: {srvmPub?.name || 'Edmardo Queiroz'} (Superintendente RVM)</option>
                                <option value="CS">🤝 Comissão de Serviço (Corpo)</option>
                                <option value="Admin">⚙️ Admin (Ajuste Técnico)</option>
                            </select>
                            <span style={{ fontSize: '10px', color: '#10B981', fontWeight: 600 }}>● Modo Admin</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowTutorial(true)}
                        title="Ver tutorial guiado deste formulário"
                        data-tour="btn-tutorial"
                        style={{
                            background: '#0EA5E9', color: 'white', border: 'none',
                            borderRadius: '8px', padding: '8px 12px', fontWeight: 600,
                            fontSize: '13px', cursor: 'pointer',
                        }}
                    >
                        ❓ Tutorial
                    </button>
                    <button
                        onClick={() => setShowVideoTutorial(true)}
                        title="Assistir vídeo-tutorial completo"
                        style={{
                            background: '#7C3AED', color: 'white', border: 'none',
                            borderRadius: '8px', padding: '8px 12px', fontWeight: 600,
                            fontSize: '13px', cursor: 'pointer',
                        }}
                    >
                        🎬 Vídeo-tutorial
                    </button>
                    {canManageCommittee && (
                        <>
                            <button
                                onClick={openLocalNeeds}
                                disabled={modalDataLoading}
                                data-tour="btn-localneeds"
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
                                data-tour="btn-events"
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
                        data-tour="btn-save"
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

            <div style={{ padding: '16px 20px', width: '100%', margin: '0 auto' }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="🔍 Filtrar publicador..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        data-tour="search"
                        style={{
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '7px 12px',
                            fontSize: '13px',
                            width: '220px',
                            outline: 'none',
                        }}
                    />
                    <div data-tour="tabs" style={{ display: 'flex', background: '#E2E8F0', borderRadius: '8px', padding: '2px' }}>
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
                    <button
                        type="button"
                        onClick={() => setShowHardcodedRulesModal(true)}
                        style={{
                            background: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FDE68A',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                        title="Ver regras de código duro e status invisíveis que afetam a elegibilidade"
                    >
                        <span>🔍</span>
                        <span>Status Invisíveis (Código Duro)</span>
                    </button>
                    <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: 'auto' }}>
                        {filtered.length} publicador{filtered.length !== 1 ? 'es' : ''}
                    </span>
                </div>

                {/* Legend */}
                <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>🟡 Linha alterada (ainda não salva)</span>
                    <span>✅ Toggle ativo</span>
                    <span>☐ Toggle inativo</span>
                    <span style={{ color: '#4F46E5', fontWeight: 600 }}>
                        {canEditAuthor
                            ? '🕒 Clique no botão de autoria para abrir o histórico e corrigir o autor'
                            : '🕒 Clique no botão de autoria para visualizar o histórico de alterações'}
                    </span>
                </div>

                {/* Table */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                        Carregando publicadores...
                    </div>
                ) : (
                    <div style={{
                        overflow: 'auto',
                        maxHeight: 'calc(100vh - 195px)',
                        minHeight: '400px',
                        borderRadius: '10px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        border: '1px solid #E2E8F0',
                        background: 'white',
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                                    <th style={thStyle}>Publicador</th>
                                    {section === 'status' && <>
                                        <th style={thStyle} data-tour="col-isServing">Em Serviço</th>
                                        <th style={thStyle} data-tour="col-notQualified">Não Apto</th>
                                        <th style={{ ...thStyle, minWidth: '140px' }}>Motivo (Não Apto)</th>
                                        <th style={thStyle} data-tour="col-noParticip">Pediu Não Participar</th>
                                        <th style={{ ...thStyle, minWidth: '140px' }}>Motivo (Não Participar)</th>
                                        <th style={thStyle} data-tour="col-indefinitelyPaused">Pausado (Admin)</th>
                                        <th style={{ ...thStyle, minWidth: '140px' }}>Motivo (Pausa)</th>
                                        <th style={thStyle} data-tour="col-helperOnly">Só Ajudante</th>
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
                                    const pubHistory = historyMap.get(pub.id) || [];
                                    const lastChange = resolveLastChangeForSection(eff, pubHistory, section);

                                    return (
                                        <tr key={pub.id} style={{ background: rowBg, borderBottom: '1px solid #F1F5F9' }}>
                                            {/* Name & History Tooltip */}
                                            <td style={{ ...tdStyle, fontWeight: isDirty ? 700 : 400, color: isDirty ? '#92400E' : '#1E293B', minWidth: '220px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {isDirty && <span style={{ fontSize: '10px', color: '#F59E0B' }} title="Alteração não salva">●</span>}
                                                    <span style={{ fontWeight: 600 }}>{eff.name}</span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
                                                    {eff.condition} · {eff.gender === 'brother' ? '👨' : '👩'}
                                                </div>
                                                <PublisherStatusHistoryTooltip
                                                    publisher={eff}
                                                    activeSection={section}
                                                    lastChange={lastChange}
                                                    historyList={pubHistory}
                                                    canEditAuthor={canEditAuthor}
                                                    token={tokenInfo?.token || token}
                                                    authorOptions={[
                                                        { label: ccaPub ? `👑 CCA: ${ccaPub.name}` : '👑 CCA: Israel Vieira', value: ccaPub ? `CCA: ${ccaPub.name}` : 'CCA: Israel Vieira' },
                                                        { label: secPub ? `📋 SEC: ${secPub.name}` : '📋 SEC: Marcos Rogério', value: secPub ? `SEC: ${secPub.name}` : 'SEC: Marcos Rogério' },
                                                        { label: srvmPub ? `📖 SRVM: ${srvmPub.name}` : '📖 SRVM: Edmardo Queiroz', value: srvmPub ? `SRVM: ${srvmPub.name}` : 'SRVM: Edmardo Queiroz' },
                                                        { label: '🤝 Comissão de Serviço', value: 'Comissão de Serviço' },
                                                        { label: '🏛️ Legado (Sem identificação de log)', value: 'legado' },
                                                        { label: '⚙️ Admin (Ajuste Técnico)', value: 'Admin' },
                                                    ]}
                                                    onAuthorUpdated={(pubId, histId, newAuthor) => {
                                                        // Atualiza historyMap em memória
                                                        setHistoryMap(prev => {
                                                            const next = new Map(prev);
                                                            const list = next.get(pubId) || [];
                                                            const updatedList = histId
                                                                ? list.map(r => r.id === histId ? { ...r, author_label: newAuthor } : r)
                                                                : list.map((r, i) => i === 0 ? { ...r, author_label: newAuthor } : r);
                                                            next.set(pubId, updatedList);
                                                            return next;
                                                        });
                                                        // Atualiza publishers profileMeta em memória
                                                        setPublishers(prev => prev.map(p => {
                                                            if (p.id !== pubId) return p;
                                                            const curMeta = (p as any).profileMeta || {};
                                                            return {
                                                                ...p,
                                                                profileMeta: {
                                                                    ...curMeta,
                                                                    updatedBy: newAuthor,
                                                                },
                                                            };
                                                        }));
                                                    }}
                                                />
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
                                                        value={!!eff.isIndefinitelyPaused}
                                                        onChange={v => setField(pub.id, 'isIndefinitelyPaused', v)}
                                                        activeColor="#F43F5E"
                                                        disabled={!canEditOtherStatus}
                                                    />
                                                </td>
                                                <td style={tdStyle}>
                                                    <input
                                                        type="text"
                                                        placeholder="Motivo..."
                                                        value={eff.indefinitePauseReason || ''}
                                                        onChange={e => setField(pub.id, 'indefinitePauseReason', e.target.value)}
                                                        disabled={!canEditOtherStatus || !eff.isIndefinitelyPaused}
                                                        style={reasonInputStyle(!canEditOtherStatus || !eff.isIndefinitelyPaused)}
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
                    await reflectPublisherImpediments(
                        pendingImpediments.publisherName,
                        pendingImpediments.impediments
                    );
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
                    role={role}
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
                    role={role}
                    announcementsOnly={announcementsOnly}
                />
            </div>
        )}

        <PublisherFormTutorial
            role={role}
            open={showTutorial}
            announcementsOnly={announcementsOnly}
            onClose={() => {
                setShowTutorial(false);
                try { localStorage.setItem(tutorialSeenKey(role), '1'); } catch { /* ignore */ }
            }}
            onRequireSection={(s) => setSection(s)}
        />

        {showVideoTutorial && (
            <VideoTutorialModal onClose={() => setShowVideoTutorial(false)} />
        )}

        <HardcodedRulesModal
            open={showHardcodedRulesModal}
            onClose={() => setShowHardcodedRulesModal(false)}
        />
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
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: '#F1F5F9',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    padding: '9px 12px',
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

// ─── Modal Explicativo de Status Invisíveis & Código Duro ─────────────────────
function HardcodedRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
        }}>
            <div style={{
                background: 'white',
                borderRadius: '16px',
                maxWidth: '640px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                border: '1px solid #E2E8F0',
                padding: '24px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E2E8F0', paddingBottom: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '26px' }}>🛡️</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '17px', color: '#0F172A', fontWeight: 700 }}>
                                Regras de Código Duro & Status Invisíveis
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                                Entenda os bloqueios do motor que atuam independentemente dos toggles desta tela
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#F1F5F9',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            color: '#64748B',
                            fontWeight: 700,
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⛔</span> 1. Disponibilidade Temporal (Portal de Disponibilidade)
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#78350F' }}>
                            Se um publicador definiu modo <code>&apos;never&apos;</code> ou registrou datas de exceção bloqueadas no seu link de disponibilidade pessoal, o motor em <code>eligibilityService.ts</code> o exclui sumariamente das semanas afetadas, mesmo que ele esteja como &quot;Em Serviço&quot; ativo nesta tabela.
                        </p>
                    </div>

                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚠️</span> 2. Publicador Não Batizado (Regra Litúrgica)
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#1E3A8A' }}>
                            Por código duro (<code>eligibilityService.ts:410, 494</code>), publicadores não batizados jamais são elegíveis para: Oração, Leitura do Estudo Bíblico (EBC), Direção de EBC, Discursos de Ensino ou Presidência, mesmo que esses toggles estejam ativados nesta tela.
                        </p>
                    </div>

                    <div style={{ background: '#FDF2F8', border: '1px solid #FBCFE8', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#9D174D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>👩</span> 3. Restrições Litúrgicas por Gênero
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#831843' }}>
                            Conforme o arranjo teocrático bíblico (<code>eligibilityService.ts:399, 413, 437, 457, 491</code>), irmãs não podem presidir, orar, ler EBC, proferir discursos de ensino ou fazer a leitura da Bíblia da semana. Seus privilégios ativos aplicam-se estritamente a partes de estudante e como ajudantes.
                        </p>
                    </div>

                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🧒</span> 4. Faixa Etária Infantil (Crianças)
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569' }}>
                            Publicadores com faixa etária <code>child</code> são bloqueados por código duro (<code>eligibilityService.ts:728</code>) de receber partes normais ou discursos de estudante avançados sem acompanhamento pastoral.
                        </p>
                    </div>

                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>👨‍👩‍👧</span> 5. Pareamento Estrito Familiar
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569' }}>
                            Se <code>canPairWithNonParent</code> for falso, o menor só pode ser escalado como ajudante ou titular se o seu parceiro na designação for expressamente seu pai ou sua mãe cadastrado.
                        </p>
                    </div>

                    <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px' }}>
                        <strong style={{ color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🚫</span> 6. Não Congregado (Eixo A do RM)
                        </strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#7F1D1D' }}>
                            Se <code>is_congregated === false</code>, o publicador é removido imediatamente de qualquer escala de reunião pelo motor, independente de qualquer privilégio individual configurado.
                        </p>
                    </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#0F172A',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '9px 24px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
