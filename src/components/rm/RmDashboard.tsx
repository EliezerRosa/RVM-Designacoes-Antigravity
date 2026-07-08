/**
 * RmDashboard â€” KPIs de consolidaÃ§Ã£o (S-1), progresso de entregas, abrir/fechar mÃªs.
 * VisÃ£o Geral: sÃ©rie anual com grÃ¡ficos BarChart (recharts).
 */
import { useEffect, useMemo, useState } from 'react';
import {
    Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    rmService,
    type RmCongregation, type RmMonthControl, type S1ConsolidationRow,
} from '../../services/rm/rmService';

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function Kpi({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', minWidth: 130 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{label}</div>
        </div>
    );
}

type Tab = 'mensal' | 'anual';

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: active ? '#3b82f6' : '#1e293b', color: '#fff', fontSize: '0.85rem',
});

export function RmDashboard() {
    const now = new Date();
    const [tab, setTab] = useState<Tab>('mensal');
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [congId, setCongId] = useState('');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [consolidation, setConsolidation] = useState<S1ConsolidationRow | null>(null);
    const [activeCount, setActiveCount] = useState(0);
    const [monthCtl, setMonthCtl] = useState<RmMonthControl | null>(null);
    const [series, setSeries] = useState<S1ConsolidationRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        rmService.listCongregations().then(c => {
            setCongs(c);
            if (!congId && c.length > 0) setCongId(c[0].id);
        }).catch(e => setError(String((e as Error).message ?? e)));
    }, []);

    const reload = async () => {
        if (!congId) return;
        setError(null);
        try {
            const [rows, pubs, controls] = await Promise.all([
                rmService.getConsolidation(year, month),
                rmService.listPublishers(congId),
                rmService.listMonthControl(congId),
            ]);
            setConsolidation(rows.find(r => r.congregation_id === congId) ?? null);
            setActiveCount(pubs.filter(p => p.is_active).length);
            setMonthCtl(controls.find(c => c.reference_year === year && c.reference_month === month) ?? null);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    useEffect(() => { void reload(); }, [congId, year, month]);

    const reloadSeries = async () => {
        if (!congId) return;
        try {
            const rows = await rmService.getConsolidationSeries(year, congId);
            setSeries(rows);
        } catch { setSeries([]); }
    };
    useEffect(() => { void reloadSeries(); }, [congId, year]);

    const submitted = consolidation?.total_reports ?? 0;
    const pct = useMemo(() => activeCount > 0 ? Math.round((submitted / activeCount) * 100) : 0, [submitted, activeCount]);

    const chartData = useMemo(() =>
        MONTHS_SHORT.map((mes, i) => {
            const row = series.find(r => r.reference_month === i + 1);
            return {
                mes,
                Pregaram: row?.total_preached ?? 0,
                'P. Auxiliar': row?.auxiliary_hours ?? 0,
                Estudos: row?.total_studies ?? 0,
                Relatórios: row?.total_reports ?? 0,
            };
        }), [series]);

    const hasSeriesData = series.some(r => r.total_reports > 0);

    const toggleMonth = async (open: boolean) => {
        if (!congId) return;
        setBusy(true); setError(null);
        try {
            if (open) await rmService.openMonth(congId, year, month);
            else await rmService.closeMonth(congId, year, month);
            await reload();
        } catch (e) { setError(String((e as Error).message ?? e)); }
        finally { setBusy(false); }
    };

    const congName = congs.find(c => c.id === congId)?.name ?? '';

    return (
        <div style={{ padding: '1rem' }}>
            <h3 style={{ marginBottom: 12 }}>Painel â€” RelatÃ³rio Mensal</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button style={TAB_STYLE(tab === 'mensal')} onClick={() => setTab('mensal')}>MÃªs Atual</button>
                <button style={TAB_STYLE(tab === 'anual')} onClick={() => setTab('anual')}>VisÃ£o Anual</button>
            </div>

            {/* Filtros comuns */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>CongregaÃ§Ã£o
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label>Ano <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} /></label>
                {tab === 'mensal' && (
                    <label>MÃªs
                        <select value={month} onChange={e => setMonth(Number(e.target.value))}>
                            {MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </label>
                )}
                {tab === 'mensal' && (
                    <>
                        <span style={{
                            padding: '4px 10px', borderRadius: 6,
                            background: monthCtl?.is_open === false ? '#7f1d1d' : '#14532d',
                            color: '#fff', fontSize: '0.8rem',
                        }}>
                            {monthCtl?.is_open === false ? 'MÃªs fechado' : 'MÃªs aberto'}
                        </span>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(true)}>Abrir mÃªs</button>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(false)}>Fechar mÃªs</button>
                    </>
                )}
            </div>

            {/* â”€â”€ MÃªs Atual â”€â”€ */}
            {tab === 'mensal' && (
                <>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                        <Kpi label="Relatórios entregues" value={submitted} />
                        <Kpi label="Publicadores ativos" value={activeCount} />
                        <Kpi label="Pregaram" value={consolidation?.total_preached ?? 0} />
                        <Kpi label="Estudos" value={consolidation?.total_studies ?? 0} />
                        <Kpi label="Horas pioneiros" value={consolidation?.pioneer_hours ?? 0} />
                        <Kpi label="Horas auxiliares" value={consolidation?.auxiliary_hours ?? 0} />
                        <Kpi label="Atrasados" value={consolidation?.late_count ?? 0} />
                    </div>
                    <div style={{ maxWidth: 480 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                            <span>Progresso de entregas</span><span>{pct}%</span>
                        </div>
                        <div style={{ background: '#334155', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#22c55e' : '#3b82f6' }} />
                        </div>
                    </div>
                </>
            )}

            {/* â”€â”€ VisÃ£o Anual â”€â”€ */}
            {tab === 'anual' && (
                <div>
                    <h4 style={{ marginBottom: 12, color: '#94a3b8' }}>
                        {year} â€” {congName}
                    </h4>
                    {!hasSeriesData ? (
                        <div style={{
                            background: '#1e293b', borderRadius: 8, padding: '2rem',
                            textAlign: 'center', color: '#64748b',
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>ðŸ“Š</div>
                            <div>Sem dados para {year}.</div>
                            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                                Importe os relatÃ³rios na aba <strong>SincronizaÃ§Ã£o</strong> para visualizar os grÃ¡ficos.
                            </div>
                        </div>
                    ) : (
                        <>
                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8 }}>
                                Relatórios entregues, publicadores que pregaram e estudos bÃ­blicos â€” mÃªs a mÃªs.
                            </p>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="Relatórios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Pregaram" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Estudos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="P. Auxiliar" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
