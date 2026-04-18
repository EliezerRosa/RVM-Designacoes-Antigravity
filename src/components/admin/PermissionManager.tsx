/**
 * PermissionManager — Admin UI for permission_policies & user_permission_overrides
 * 
 * Two sections:
 * 1. Policies: CRUD for condition+funcao-based permission templates
 * 2. Overrides: Per-user exceptions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { ActiveTab } from '../../services/permissionService';

// ===== Types =====

interface PermissionPolicy {
    id: string;
    target_condition: string | null;
    target_funcao: string | null;
    allowed_tabs: string[];
    allowed_agent_actions: string[];
    blocked_agent_actions: string[];
    data_access_level: string;
    can_see_sensitive_data: boolean;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    priority: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface UserOverride {
    id: string;
    profile_id: string;
    allowed_tabs: string[] | null;
    allowed_agent_actions: string[] | null;
    blocked_agent_actions: string[] | null;
    data_access_level: string | null;
    can_see_sensitive_data: boolean | null;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // Join
    profile_email?: string;
    profile_name?: string;
}

// ===== Constants =====

const ALL_TABS: ActiveTab[] = ['workbook', 'approvals', 'publishers', 'territories', 'backup', 'agent', 'admin', 'communication'];

const ALL_ACTIONS = [
    'GENERATE_WEEK', 'ASSIGN_PART', 'APPROVE_PROPOSAL', 'REJECT_PROPOSAL', 'COMPLETE_PART', 'UNDO_COMPLETE_PART', 'UNDO_LAST', 'NAVIGATE_WEEK', 'VIEW_S140',
    'SHARE_S140_WHATSAPP', 'CHECK_SCORE', 'CLEAR_WEEK', 'UPDATE_PUBLISHER',
    'UPDATE_AVAILABILITY', 'UPDATE_ENGINE_RULES', 'MANAGE_SPECIAL_EVENT',
    'SEND_S140', 'SEND_S89', 'FETCH_DATA', 'SIMULATE_ASSIGNMENT',
    'NOTIFY_REFUSAL', 'SHOW_MODAL', 'MANAGE_LOCAL_NEEDS', 'GET_ANALYTICS',
    'IMPORT_WORKBOOK', 'MANAGE_WORKBOOK_PART', 'MANAGE_WORKBOOK_WEEK',
] as const;

const CONDITIONS = ['Ancião', 'Servo Ministerial', 'Publicador'];
const FUNCOES = [
    'Coordenador do Corpo de Anciãos',
    'Secretário',
    'Superintendente de Serviço',
    'Superintendente da Reunião Vida e Ministério',
    'Ajudante do Superintendente da Reunião Vida e Ministério',
];

const DATA_ACCESS_LEVELS = ['all', 'filtered', 'self'] as const;

const TAB_LABELS: Record<string, string> = {
    workbook: '📖 Apostila',
    approvals: '✅ Aprovações',
    publishers: '👥 Publicadores',
    territories: '🌍 Territórios',
    backup: '💾 Backup',
    agent: '🤖 Agente',
    admin: '📊 Admin',
    communication: '💬 Comunicação',
};

// ===== Styles =====

const cardStyle: React.CSSProperties = {
    background: '#1E293B',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '20px',
    marginBottom: '16px',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    color: '#94a3b8',
    marginBottom: '4px',
    fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '0.85rem',
};

const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
    background: '#4F46E5',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
};

const btnDanger: React.CSSProperties = {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '0.8rem',
};

const btnSecondary: React.CSSProperties = {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #475569',
    borderRadius: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '0.8rem',
};

const chipContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
};

const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    background: active ? '#4F46E5' : '#1e293b',
    color: active ? '#fff' : '#94a3b8',
    border: `1px solid ${active ? '#4F46E5' : '#475569'}`,
    transition: 'all 0.15s',
    userSelect: 'none',
});

// ===== Component =====

export function PermissionManager() {
    const [policies, setPolicies] = useState<PermissionPolicy[]>([]);
    const [overrides, setOverrides] = useState<UserOverride[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<'policies' | 'overrides'>('policies');
    const [editingPolicy, setEditingPolicy] = useState<PermissionPolicy | null>(null);
    const [editingOverride, setEditingOverride] = useState<UserOverride | null>(null);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // ===== Load Data =====

    const loadPolicies = useCallback(async () => {
        const { data, error } = await supabase
            .from('permission_policies')
            .select('*')
            .order('priority', { ascending: false });
        if (error) {
            setMsg({ text: `Erro ao carregar políticas: ${error.message}`, type: 'error' });
            return;
        }
        setPolicies(data || []);
    }, []);

    const loadOverrides = useCallback(async () => {
        const { data, error } = await supabase
            .from('user_permission_overrides')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            setMsg({ text: `Erro ao carregar overrides: ${error.message}`, type: 'error' });
            return;
        }

        // Enrich with profile info
        if (data && data.length > 0) {
            const profileIds = data.map(d => d.profile_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email, full_name')
                .in('id', profileIds);

            const profileMap = new Map((profiles || []).map(p => [p.id, p]));
            const enriched: UserOverride[] = data.map(d => ({
                ...d,
                profile_email: profileMap.get(d.profile_id)?.email ?? '?',
                profile_name: profileMap.get(d.profile_id)?.full_name ?? null,
            }));
            setOverrides(enriched);
        } else {
            setOverrides([]);
        }
    }, []);

    useEffect(() => {
        Promise.all([loadPolicies(), loadOverrides()]).finally(() => setIsLoading(false));
    }, [loadPolicies, loadOverrides]);

    // ===== Policy CRUD =====

    const savePolicy = async (policy: Partial<PermissionPolicy> & { id?: string }) => {
        const isNew = !policy.id;
        const payload = {
            target_condition: policy.target_condition || null,
            target_funcao: policy.target_funcao || null,
            allowed_tabs: policy.allowed_tabs || ['agent'],
            allowed_agent_actions: policy.allowed_agent_actions || [],
            blocked_agent_actions: policy.blocked_agent_actions || [],
            data_access_level: policy.data_access_level || 'self',
            can_see_sensitive_data: policy.can_see_sensitive_data ?? false,
            publisher_filter_conditions: policy.publisher_filter_conditions || null,
            publisher_filter_statuses: policy.publisher_filter_statuses || null,
            publisher_filter_exclude_names: policy.publisher_filter_exclude_names || null,
            priority: policy.priority ?? 0,
            is_active: policy.is_active ?? true,
            updated_at: new Date().toISOString(),
        };

        if (isNew) {
            const { error } = await supabase.from('permission_policies').insert(payload);
            if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        } else {
            const { error } = await supabase.from('permission_policies').update(payload).eq('id', policy.id);
            if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        }
        setMsg({ text: isNew ? 'Política criada!' : 'Política atualizada!', type: 'success' });
        setEditingPolicy(null);
        await loadPolicies();
    };

    const deletePolicy = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta política?')) return;
        const { error } = await supabase.from('permission_policies').delete().eq('id', id);
        if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        setMsg({ text: 'Política excluída.', type: 'success' });
        await loadPolicies();
    };

    const togglePolicyActive = async (id: string, currentActive: boolean) => {
        const { error } = await supabase
            .from('permission_policies')
            .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        await loadPolicies();
    };

    // ===== Override CRUD =====

    const saveOverride = async (override: Partial<UserOverride> & { profile_id: string; id?: string }) => {
        const isNew = !override.id;
        const payload = {
            profile_id: override.profile_id,
            allowed_tabs: override.allowed_tabs || null,
            allowed_agent_actions: override.allowed_agent_actions || null,
            blocked_agent_actions: override.blocked_agent_actions || null,
            data_access_level: override.data_access_level || null,
            can_see_sensitive_data: override.can_see_sensitive_data ?? null,
            publisher_filter_conditions: override.publisher_filter_conditions || null,
            publisher_filter_statuses: override.publisher_filter_statuses || null,
            publisher_filter_exclude_names: override.publisher_filter_exclude_names || null,
            is_active: override.is_active ?? true,
            updated_at: new Date().toISOString(),
        };

        if (isNew) {
            const { error } = await supabase.from('user_permission_overrides').insert(payload);
            if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        } else {
            const { error } = await supabase.from('user_permission_overrides').update(payload).eq('id', override.id);
            if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        }
        setMsg({ text: isNew ? 'Override criado!' : 'Override atualizado!', type: 'success' });
        setEditingOverride(null);
        await loadOverrides();
    };

    const deleteOverride = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este override?')) return;
        const { error } = await supabase.from('user_permission_overrides').delete().eq('id', id);
        if (error) { setMsg({ text: `Erro: ${error.message}`, type: 'error' }); return; }
        setMsg({ text: 'Override excluído.', type: 'success' });
        await loadOverrides();
    };

    // ===== Render =====

    if (isLoading) {
        return <div style={{ color: '#94a3b8', padding: '24px', textAlign: 'center' }}>Carregando permissões...</div>;
    }

    return (
        <div style={{ color: '#e2e8f0' }}>
            {/* Message Banner */}
            {msg && (
                <div style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    background: msg.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: msg.type === 'success' ? '#4ade80' : '#f87171',
                    border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    fontSize: '0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg(null)} style={{ ...btnSecondary, padding: '2px 8px', fontSize: '0.75rem' }}>✕</button>
                </div>
            )}

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button
                    onClick={() => setActiveSection('policies')}
                    style={{
                        ...btnPrimary,
                        background: activeSection === 'policies' ? '#4F46E5' : 'transparent',
                        border: activeSection === 'policies' ? 'none' : '1px solid #4F46E5',
                        color: activeSection === 'policies' ? '#fff' : '#a5b4fc',
                    }}
                >
                    📋 Políticas ({policies.length})
                </button>
                <button
                    onClick={() => setActiveSection('overrides')}
                    style={{
                        ...btnPrimary,
                        background: activeSection === 'overrides' ? '#4F46E5' : 'transparent',
                        border: activeSection === 'overrides' ? 'none' : '1px solid #4F46E5',
                        color: activeSection === 'overrides' ? '#fff' : '#a5b4fc',
                    }}
                >
                    🔑 Overrides ({overrides.length})
                </button>
            </div>

            {/* Policies Section */}
            {activeSection === 'policies' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ margin: 0, color: '#e2e8f0' }}>Políticas de Permissão</h4>
                        <button
                            onClick={() => setEditingPolicy({
                                id: '',
                                target_condition: null,
                                target_funcao: null,
                                allowed_tabs: ['agent'],
                                allowed_agent_actions: [],
                                blocked_agent_actions: [],
                                data_access_level: 'self',
                                can_see_sensitive_data: false,
                                publisher_filter_conditions: null,
                                publisher_filter_statuses: null,
                                publisher_filter_exclude_names: null,
                                priority: 0,
                                is_active: true,
                                created_at: '',
                                updated_at: '',
                            })}
                            style={btnPrimary}
                        >
                            + Nova Política
                        </button>
                    </div>

                    {/* Policy Editor Modal */}
                    {editingPolicy && (
                        <PolicyEditor
                            policy={editingPolicy}
                            onSave={savePolicy}
                            onCancel={() => setEditingPolicy(null)}
                        />
                    )}

                    {/* Policy List */}
                    {policies.map(p => (
                        <div key={p.id} style={{ ...cardStyle, opacity: p.is_active ? 1 : 0.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                                        {p.target_condition || '* Qualquer Condição'}
                                        {p.target_funcao ? ` → ${p.target_funcao}` : ''}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                        Prioridade: {p.priority} | Acesso: {p.data_access_level} | Sensíveis: {p.can_see_sensitive_data ? '✅' : '❌'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => togglePolicyActive(p.id, p.is_active)}
                                        style={{ ...btnSecondary, color: p.is_active ? '#f59e0b' : '#4ade80' }}
                                    >
                                        {p.is_active ? '⏸ Desativar' : '▶ Ativar'}
                                    </button>
                                    <button onClick={() => setEditingPolicy(p)} style={btnSecondary}>✏️ Editar</button>
                                    <button onClick={() => deletePolicy(p.id)} style={btnDanger}>🗑</button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                <div>
                                    <span style={{ color: '#64748b' }}>Abas: </span>
                                    {p.allowed_tabs.map(t => (
                                        <span key={t} style={{ ...chipStyle(true), cursor: 'default', marginRight: '4px' }}>
                                            {TAB_LABELS[t] || t}
                                        </span>
                                    ))}
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Ações: </span>
                                    <span style={{ color: '#e2e8f0' }}>{p.allowed_agent_actions.length} permitidas</span>
                                    {p.blocked_agent_actions.length > 0 && (
                                        <span style={{ color: '#f87171', marginLeft: '8px' }}>
                                            {p.blocked_agent_actions.length} bloqueadas
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {policies.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                            Nenhuma política encontrada. Crie uma para começar.
                        </div>
                    )}
                </div>
            )}

            {/* Overrides Section */}
            {activeSection === 'overrides' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ margin: 0, color: '#e2e8f0' }}>Overrides por Usuário</h4>
                        <button
                            onClick={() => setEditingOverride({
                                id: '',
                                profile_id: '',
                                allowed_tabs: null,
                                allowed_agent_actions: null,
                                blocked_agent_actions: null,
                                data_access_level: null,
                                can_see_sensitive_data: null,
                                publisher_filter_conditions: null,
                                publisher_filter_statuses: null,
                                publisher_filter_exclude_names: null,
                                is_active: true,
                                created_at: '',
                                updated_at: '',
                            })}
                            style={btnPrimary}
                        >
                            + Novo Override
                        </button>
                    </div>

                    {editingOverride && (
                        <OverrideEditor
                            override={editingOverride}
                            onSave={saveOverride}
                            onCancel={() => setEditingOverride(null)}
                        />
                    )}

                    {overrides.map(o => (
                        <div key={o.id} style={{ ...cardStyle, opacity: o.is_active ? 1 : 0.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                                        👤 {o.profile_name || o.profile_email || o.profile_id}
                                    </div>
                                    {o.profile_email && (
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{o.profile_email}</div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => setEditingOverride(o)} style={btnSecondary}>✏️ Editar</button>
                                    <button onClick={() => deleteOverride(o.id)} style={btnDanger}>🗑</button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                {o.allowed_tabs ? `Abas: ${o.allowed_tabs.join(', ')}` : 'Abas: herda da política'}
                                {' | '}
                                {o.data_access_level ? `Acesso: ${o.data_access_level}` : 'Acesso: herda'}
                                {' | '}
                                {o.can_see_sensitive_data !== null ? `Sensíveis: ${o.can_see_sensitive_data ? '✅' : '❌'}` : 'Sensíveis: herda'}
                            </div>
                        </div>
                    ))}

                    {overrides.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                            Nenhum override. Use para exceções individuais (ex: dar acesso extra a um publicador).
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ===== Policy Editor Sub-component =====

function PolicyEditor({ policy, onSave, onCancel }: {
    policy: PermissionPolicy;
    onSave: (p: Partial<PermissionPolicy> & { id?: string }) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState({ ...policy });
    const isNew = !policy.id;

    const toggleArrayItem = (arr: string[], item: string): string[] => {
        return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
    };

    return (
        <div style={{ ...cardStyle, border: '1px solid #4F46E5', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', color: '#a5b4fc' }}>
                {isNew ? '➕ Nova Política' : '✏️ Editar Política'}
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <label style={labelStyle}>Condição</label>
                    <select
                        value={form.target_condition || ''}
                        onChange={e => setForm({ ...form, target_condition: e.target.value || null })}
                        style={selectStyle}
                    >
                        <option value="">* Qualquer</option>
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Função</label>
                    <select
                        value={form.target_funcao || ''}
                        onChange={e => setForm({ ...form, target_funcao: e.target.value || null })}
                        style={selectStyle}
                    >
                        <option value="">* Qualquer</option>
                        {FUNCOES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Prioridade</label>
                    <input
                        type="number"
                        value={form.priority}
                        onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                        style={inputStyle}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <label style={labelStyle}>Nível de Acesso a Dados</label>
                    <select
                        value={form.data_access_level}
                        onChange={e => setForm({ ...form, data_access_level: e.target.value })}
                        style={selectStyle}
                    >
                        {DATA_ACCESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'end', gap: '12px', paddingBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.85rem' }}>
                        <input
                            type="checkbox"
                            checked={form.can_see_sensitive_data}
                            onChange={e => setForm({ ...form, can_see_sensitive_data: e.target.checked })}
                        />
                        Pode ver dados sensíveis
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.85rem' }}>
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        />
                        Ativa
                    </label>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Abas Permitidas</label>
                <div style={chipContainerStyle}>
                    {ALL_TABS.map(tab => (
                        <span
                            key={tab}
                            onClick={() => setForm({ ...form, allowed_tabs: toggleArrayItem(form.allowed_tabs, tab) })}
                            style={chipStyle(form.allowed_tabs.includes(tab))}
                        >
                            {TAB_LABELS[tab]}
                        </span>
                    ))}
                </div>
            </div>

            {/* Allowed Actions */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>
                    Ações Permitidas ({form.allowed_agent_actions.length}/{ALL_ACTIONS.length})
                    <button
                        onClick={() => setForm({ ...form, allowed_agent_actions: [...ALL_ACTIONS] })}
                        style={{ ...btnSecondary, marginLeft: '12px', padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                        Todas
                    </button>
                    <button
                        onClick={() => setForm({ ...form, allowed_agent_actions: [] })}
                        style={{ ...btnSecondary, marginLeft: '4px', padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                        Nenhuma
                    </button>
                </label>
                <div style={chipContainerStyle}>
                    {ALL_ACTIONS.map(action => (
                        <span
                            key={action}
                            onClick={() => setForm({ ...form, allowed_agent_actions: toggleArrayItem(form.allowed_agent_actions, action) })}
                            style={chipStyle(form.allowed_agent_actions.includes(action))}
                        >
                            {action}
                        </span>
                    ))}
                </div>
            </div>

            {/* Blocked Actions */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Ações Bloqueadas (override sobre permitidas)</label>
                <div style={chipContainerStyle}>
                    {ALL_ACTIONS.map(action => (
                        <span
                            key={action}
                            onClick={() => setForm({ ...form, blocked_agent_actions: toggleArrayItem(form.blocked_agent_actions, action) })}
                            style={{
                                ...chipStyle(form.blocked_agent_actions.includes(action)),
                                background: form.blocked_agent_actions.includes(action) ? '#dc2626' : '#1e293b',
                                borderColor: form.blocked_agent_actions.includes(action) ? '#dc2626' : '#475569',
                            }}
                        >
                            {action}
                        </span>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
                <button
                    onClick={() => onSave({ ...form, id: isNew ? undefined : form.id })}
                    style={btnPrimary}
                >
                    {isNew ? 'Criar' : 'Salvar'}
                </button>
            </div>
        </div>
    );
}

// ===== Override Editor Sub-component =====

function OverrideEditor({ override, onSave, onCancel }: {
    override: UserOverride;
    onSave: (o: Partial<UserOverride> & { profile_id: string; id?: string }) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState({ ...override });
    const [profileSearch, setProfileSearch] = useState('');
    const [profileResults, setProfileResults] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
    const isNew = !override.id;

    const searchProfiles = async (query: string) => {
        if (query.length < 2) { setProfileResults([]); return; }
        const { data } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .ilike('email', `%${query}%`)
            .limit(5);
        setProfileResults(data || []);
    };

    const toggleArrayItem = (arr: string[] | null, item: string): string[] => {
        const current = arr || [];
        return current.includes(item) ? current.filter(x => x !== item) : [...current, item];
    };

    return (
        <div style={{ ...cardStyle, border: '1px solid #f59e0b', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', color: '#fbbf24' }}>
                {isNew ? '➕ Novo Override' : '✏️ Editar Override'}
            </h4>

            {/* Profile Search */}
            {isNew && (
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Buscar Usuário (por email)</label>
                    <input
                        value={profileSearch}
                        onChange={e => { setProfileSearch(e.target.value); searchProfiles(e.target.value); }}
                        placeholder="Digite o email..."
                        style={inputStyle}
                    />
                    {profileResults.length > 0 && (
                        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '0 0 6px 6px', marginTop: '-1px' }}>
                            {profileResults.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => {
                                        setForm({ ...form, profile_id: p.id, profile_email: p.email, profile_name: p.full_name ?? undefined });
                                        setProfileSearch(p.email);
                                        setProfileResults([]);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        color: '#e2e8f0',
                                        borderBottom: '1px solid #1e293b',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                                </div>
                            ))}
                        </div>
                    )}
                    {form.profile_id && (
                        <div style={{ fontSize: '0.8rem', color: '#4ade80', marginTop: '4px' }}>
                            ✅ {form.profile_name || form.profile_email || form.profile_id}
                        </div>
                    )}
                </div>
            )}

            {!isNew && (
                <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: '#94a3b8' }}>
                    Usuário: <strong style={{ color: '#e2e8f0' }}>{override.profile_name || override.profile_email}</strong>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <label style={labelStyle}>Nível de Acesso (null = herda)</label>
                    <select
                        value={form.data_access_level || ''}
                        onChange={e => setForm({ ...form, data_access_level: e.target.value || null })}
                        style={selectStyle}
                    >
                        <option value="">Herdar da política</option>
                        {DATA_ACCESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'end', gap: '12px', paddingBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.85rem' }}>
                        <input
                            type="checkbox"
                            checked={form.can_see_sensitive_data ?? false}
                            onChange={e => setForm({ ...form, can_see_sensitive_data: e.target.checked })}
                        />
                        Ver dados sensíveis
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.85rem' }}>
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        />
                        Ativo
                    </label>
                </div>
            </div>

            {/* Override Tabs */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Abas Override (vazio = herdar)</label>
                <div style={chipContainerStyle}>
                    {ALL_TABS.map(tab => (
                        <span
                            key={tab}
                            onClick={() => setForm({ ...form, allowed_tabs: toggleArrayItem(form.allowed_tabs, tab) })}
                            style={chipStyle((form.allowed_tabs || []).includes(tab))}
                        >
                            {TAB_LABELS[tab]}
                        </span>
                    ))}
                    {(form.allowed_tabs?.length ?? 0) > 0 && (
                        <button onClick={() => setForm({ ...form, allowed_tabs: null })} style={{ ...btnSecondary, padding: '2px 8px', fontSize: '0.7rem' }}>
                            Limpar (herdar)
                        </button>
                    )}
                </div>
            </div>

            {/* Override blocked actions */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Ações Bloqueadas (adicional)</label>
                <div style={chipContainerStyle}>
                    {ALL_ACTIONS.map(action => (
                        <span
                            key={action}
                            onClick={() => setForm({ ...form, blocked_agent_actions: toggleArrayItem(form.blocked_agent_actions, action) })}
                            style={{
                                ...chipStyle((form.blocked_agent_actions || []).includes(action)),
                                background: (form.blocked_agent_actions || []).includes(action) ? '#dc2626' : '#1e293b',
                                borderColor: (form.blocked_agent_actions || []).includes(action) ? '#dc2626' : '#475569',
                            }}
                        >
                            {action}
                        </span>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
                <button
                    onClick={() => {
                        if (!form.profile_id) {
                            alert('Selecione um usuário primeiro.');
                            return;
                        }
                        onSave({ ...form, id: isNew ? undefined : form.id });
                    }}
                    style={btnPrimary}
                >
                    {isNew ? 'Criar' : 'Salvar'}
                </button>
            </div>
        </div>
    );
}
