import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import './AdminDashboard.css';

interface CacheItem {
    id: string;
    prompt_preview: string;
    thinking_level: string;
    model_used: string;
    created_at: string;
}

import { ELIGIBILITY_RULES_VERSION } from '../services/eligibilityService';
import { RULES_TEXT_VERSION } from '../services/contextBuilder.ts';
import { ActionDiagnosticPanel } from '../components/admin/ActionDiagnosticPanel';
import { AuthLogsPanel } from '../components/admin/AuthLogsPanel';
import { PermissionManager } from '../components/admin/PermissionManager';
import { PublisherFormLinkManager } from '../components/admin/PublisherFormLinkManager';
import { AvailabilityLinkManager } from '../components/admin/AvailabilityLinkManager';
import { useAuth } from '../context/AuthContext';

interface SystemLog {
    id: string;
    level: string;
    message: string;
    details: any;
    created_at: string;
}

type AdminSubTab = 'overview' | 'diagnostics' | 'auth' | 'permissions' | 'links';

const ADMIN_SUB_TABS: Array<{ id: AdminSubTab; label: string; eyebrow: string }> = [
    { id: 'overview', label: 'Visão Geral', eyebrow: 'Core' },
    { id: 'diagnostics', label: 'Diagnóstico', eyebrow: 'IA' },
    { id: 'auth', label: 'Autenticação', eyebrow: 'Segurança' },
    { id: 'permissions', label: 'Permissões', eyebrow: 'Controle' },
    { id: 'links', label: 'Links de Form', eyebrow: 'Publicadores' },
];

export function AdminDashboard() {
    const [cacheItems, setCacheItems] = useState<CacheItem[]>([]);
    const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('overview');
    const [stats, setStats] = useState({
        total: 0,
        byModel: [] as { name: string; value: number }[],
        byLevel: [] as { name: string; value: number }[]
    });
    const { profile } = useAuth();

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);

            // Fetch Cache Stats
            const { data: cacheData, error: cacheError } = await supabase
                .from('ai_intent_cache')
                .select('id, prompt_preview, thinking_level, model_used, created_at')
                .order('created_at', { ascending: false })
                .limit(50); // Reduced limit for performance

            if (cacheError) throw cacheError;

            if (cacheData) {
                setCacheItems(cacheData);
                processStats(cacheData);
            }

            // Fetch System Logs
            const { data: logData, error: logError } = await supabase
                .from('ai_system_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (!logError && logData) {
                setSystemLogs(logData);
            }

        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const processStats = (data: CacheItem[]) => {
        const modelCount: Record<string, number> = {};
        const levelCount: Record<string, number> = {};

        data.forEach(item => {
            const cleanModel = item.model_used.replace('models/', '');
            modelCount[cleanModel] = (modelCount[cleanModel] || 0) + 1;
            levelCount[item.thinking_level] = (levelCount[item.thinking_level] || 0) + 1;
        });

        setStats({
            total: data.length,
            byModel: Object.entries(modelCount).map(([name, value]) => ({ name, value })),
            byLevel: Object.entries(levelCount).map(([name, value]) => ({ name, value }))
        });
    };

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
    const activeSubTabIndex = ADMIN_SUB_TABS.findIndex(tab => tab.id === activeSubTab);
    const topModel = [...stats.byModel].sort((a, b) => b.value - a.value)[0]?.name || 'N/A';
    const topLevel = [...stats.byLevel].sort((a, b) => b.value - a.value)[0]?.name || 'N/A';

    const goToAdjacentTab = (direction: -1 | 1) => {
        const nextIndex = activeSubTabIndex + direction;
        if (nextIndex < 0 || nextIndex >= ADMIN_SUB_TABS.length) return;
        setActiveSubTab(ADMIN_SUB_TABS[nextIndex].id);
    };

    if (loading) {
        return (
            <div className="admin-dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '1.25rem', color: '#6b7280' }}>Loading Intelligence...</div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard-container">
            <div className="admin-dashboard-wrapper">
                <header className="admin-header">
                    <h1>🧠 Antigravity Admin Core</h1>
                    <p>Monitoramento em tempo real do ecossistema de Inteligência Artificial</p>
                </header>

                <section className="admin-subtabs-shell">
                    <div className="admin-subtabs-toolbar">
                        <div className="admin-subtabs-strip" role="tablist" aria-label="Seções da aba Admin">
                            {ADMIN_SUB_TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeSubTab === tab.id}
                                    className={`admin-subtab-pill ${activeSubTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveSubTab(tab.id)}
                                >
                                    <span className="admin-subtab-eyebrow">{tab.eyebrow}</span>
                                    <span className="admin-subtab-label">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="admin-subtabs-nav">
                            <button
                                type="button"
                                className="admin-carousel-arrow"
                                onClick={() => goToAdjacentTab(-1)}
                                disabled={activeSubTabIndex === 0}
                                aria-label="Sub-aba anterior"
                            >
                                ←
                            </button>
                            <button
                                type="button"
                                className="admin-carousel-arrow"
                                onClick={() => goToAdjacentTab(1)}
                                disabled={activeSubTabIndex === ADMIN_SUB_TABS.length - 1}
                                aria-label="Próxima sub-aba"
                            >
                                →
                            </button>
                        </div>
                    </div>

                    <div className="admin-carousel-window">
                        <div
                            className="admin-carousel-track"
                            style={{ transform: `translateX(-${activeSubTabIndex * 100}%)` }}
                        >
                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Visão Geral">
                                <div className="admin-panel-stack">
                                    <div className="admin-overview-hero">
                                        <div>
                                            <p className="admin-overview-kicker">Core Intelligence</p>
                                            <h2>Radar Operacional do ecossistema Admin</h2>
                                            <p>
                                                Cache, modelos, níveis de raciocínio e alertas técnicos concentrados numa visão única.
                                            </p>
                                        </div>
                                        <div className="admin-overview-badge">{stats.total} registros em cache</div>
                                    </div>

                                    <div className="admin-audit-banner">
                                        <div className="admin-audit-header">
                                            <h3>🛡️ Auditoria de Regras (Code vs Agent)</h3>
                                            <div className={`admin-audit-status ${ELIGIBILITY_RULES_VERSION === RULES_TEXT_VERSION ? 'ok' : 'error'}`}>
                                                {ELIGIBILITY_RULES_VERSION === RULES_TEXT_VERSION ? '✅ SINCRONIZADO' : '❌ ERRO DE SINCRONIA'}
                                            </div>
                                        </div>
                                        <div className="admin-audit-grid">
                                            <div>
                                                <span>Versão Código</span>
                                                <strong>{ELIGIBILITY_RULES_VERSION}</strong>
                                            </div>
                                            <div>
                                                <span>Versão Texto</span>
                                                <strong>{RULES_TEXT_VERSION}</strong>
                                            </div>
                                        </div>
                                        {ELIGIBILITY_RULES_VERSION !== RULES_TEXT_VERSION && (
                                            <div className="admin-audit-warning">
                                                ⚠️ As regras lidas pelo agente estão desatualizadas em relação ao código. Atualize `contextBuilder.ts`.
                                            </div>
                                        )}
                                    </div>

                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <h3 className="stat-title">Total Cached Intents</h3>
                                            <div className="stat-value-container">
                                                <p className="stat-value">{stats.total}</p>
                                                <span className="stat-unit">intents</span>
                                            </div>
                                            <p className="stat-description">Economia direta de tokens e latência</p>
                                        </div>

                                        <div className="stat-card">
                                            <h3 className="stat-title">Top Model</h3>
                                            <p className="stat-value" style={{ fontSize: '1.5rem', marginTop: '12px' }}>
                                                {topModel}
                                            </p>
                                            <p className="stat-description">Modelo mais utilizado pelo time</p>
                                        </div>

                                        <div className="stat-card">
                                            <h3 className="stat-title">Most Common Level</h3>
                                            <p className="stat-value" style={{ fontSize: '1.5rem', marginTop: '12px' }}>
                                                {topLevel}
                                            </p>
                                            <p className="stat-description">Complexidade média das tarefas</p>
                                        </div>
                                    </div>

                                    <div className="charts-grid">
                                        <div className="chart-card">
                                            <h3 className="chart-title">Distribuição de Modelos</h3>
                                            <div style={{ flex: 1, width: '100%' }}>
                                                {stats.total > 0 ? (
                                                    <ResponsiveContainer width="100%" height={350} minWidth={1}>
                                                        <PieChart>
                                                            <Pie
                                                                data={stats.byModel}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={60}
                                                                outerRadius={80}
                                                                fill="#8884d8"
                                                                paddingAngle={5}
                                                                dataKey="value"
                                                            >
                                                                {stats.byModel.map((_entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                                            />
                                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db' }}>
                                                        <span style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</span>
                                                        <p>Nenhum dado coletado ainda</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="chart-card">
                                            <h3 className="chart-title">Níveis de Raciocínio (Thinking Levels)</h3>
                                            <div style={{ flex: 1, width: '100%' }}>
                                                {stats.total > 0 ? (
                                                    <ResponsiveContainer width="100%" height={350} minWidth={1}>
                                                        <BarChart data={stats.byLevel} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} />
                                                            <Tooltip
                                                                cursor={{ fill: '#f9fafb' }}
                                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                                            />
                                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                                {stats.byLevel.map((_entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db' }}>
                                                        <span style={{ fontSize: '2rem', marginBottom: '8px' }}>🧠</span>
                                                        <p>Aguardando interações...</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="table-card">
                                        <div className="table-header">
                                            <h3>Fluxo de Atividade Recente</h3>
                                            <span className="live-badge">Live</span>
                                        </div>
                                        <div className="table-responsive">
                                            <table className="styled-table">
                                                <thead>
                                                    <tr>
                                                        <th>Horário</th>
                                                        <th>Nível</th>
                                                        <th>Modelo</th>
                                                        <th>Preview do Prompt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {cacheItems.length > 0 ? cacheItems.map(item => (
                                                        <tr key={item.id}>
                                                            <td>
                                                                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                            </td>
                                                            <td>
                                                                <span className={`level-badge ${item.thinking_level.toLowerCase()}`}>
                                                                    {item.thinking_level}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontWeight: 500, color: '#111827' }}>
                                                                {item.model_used.replace('models/', '')}
                                                            </td>
                                                            <td>
                                                                <div className="prompt-preview">
                                                                    {item.prompt_preview || 'No preview available'}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                        <tr>
                                                            <td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
                                                                Nenhuma atividade registrada no cache ainda.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {systemLogs.length > 0 && (
                                        <div className="table-card admin-alert-card">
                                            <div className="table-header admin-alert-header">
                                                <h3>⚠️ Alertas de Sistema (Erros Técnicos)</h3>
                                            </div>
                                            <div className="table-responsive">
                                                <table className="styled-table">
                                                    <thead>
                                                        <tr>
                                                            <th style={{ color: '#ef4444' }}>Horário</th>
                                                            <th style={{ color: '#ef4444' }}>Nível</th>
                                                            <th style={{ color: '#ef4444' }}>Mensagem</th>
                                                            <th style={{ color: '#ef4444' }}>Detalhes</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {systemLogs.map(log => (
                                                            <tr key={log.id} style={{ backgroundColor: '#fff' }}>
                                                                <td style={{ color: '#991b1b' }}>
                                                                    {new Date(log.created_at).toLocaleString()}
                                                                </td>
                                                                <td>
                                                                    <span className="level-badge high" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                                                                        {log.level}
                                                                    </span>
                                                                </td>
                                                                <td style={{ fontWeight: 600, color: '#7f1d1d' }}>
                                                                    {log.message}
                                                                </td>
                                                                <td>
                                                                    <div className="prompt-preview" style={{ color: '#b91c1c', maxWidth: '300px' }}>
                                                                        {JSON.stringify(log.details)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Diagnóstico">
                                <div className="table-card admin-panel-card">
                                    <div className="table-header">
                                        <h3>🔬 Diagnóstico de Ações do Chat-IA</h3>
                                    </div>
                                    <div style={{ padding: '16px' }}>
                                        <ActionDiagnosticPanel />
                                    </div>
                                </div>
                            </section>

                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Autenticação">
                                <div className="table-card admin-panel-card">
                                    <div className="table-header">
                                        <h3>🔐 Histórico de Autenticação & Transações</h3>
                                    </div>
                                    <AuthLogsPanel />
                                </div>
                            </section>

                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Permissões">
                                <div className="table-card admin-panel-card">
                                    <div className="table-header">
                                        <h3>🛡️ Gerenciamento de Permissões</h3>
                                    </div>
                                    <div style={{ padding: '16px' }}>
                                        <PermissionManager />
                                    </div>
                                </div>
                            </section>

                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Links de Form">
                                <div className="table-card admin-panel-card">
                                    <div className="table-header">
                                        <h3>🔗 Links de Atualização de Publicadores</h3>
                                    </div>
                                    <div style={{ padding: '16px' }}>
                                        <PublisherFormLinkManager adminEmail={profile?.email ?? undefined} />
                                    </div>
                                </div>
                            </section>

                            <section className="admin-carousel-panel" role="tabpanel" aria-label="Links de Disponibilidade">
                                <div className="table-card admin-panel-card">
                                    <div className="table-header">
                                        <h3>📅 Links de Disponibilidade Individual</h3>
                                    </div>
                                    <div style={{ padding: '16px' }}>
                                        <AvailabilityLinkManager adminEmail={profile?.email ?? undefined} />
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

// Default export for lazy loading
export default AdminDashboard;
