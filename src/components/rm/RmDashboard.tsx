/**
 * RmDashboard — KPIs de consolidação (S-1), progresso de entregas, abrir/fechar mês.
 * Visão Geral: série anual com gráficos BarChart (recharts).
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
    // Mês padrão = mês ANTERIOR (mês pendente de relatórios).
    // Se hoje é julho/2026 → padrão = junho/2026.
    const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const [tab, setTab] = useState<Tab>('mensal');
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [congId, setCongId] = useState('');
    const [year, setYear] = useState(defaultYear);
    const [month, setMonth] = useState(defaultMonth);
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
            setActiveCount(pubs.filter(p => p.is_congregated).length);
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
                Relatórios: row?.total_reports ?? 0,
                Publicadores: row?.publisher_count ?? 0,
                'P. Auxiliar': row?.auxiliary_pioneer_count ?? 0,
                'P. Regular': row?.regular_pioneer_count ?? 0,
                Estudos: row?.total_studies ?? 0,
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
            <h3 style={{ marginBottom: 12 }}>Painel — Relatório Mensal</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button style={TAB_STYLE(tab === 'mensal')} onClick={() => setTab('mensal')}>Mês Atual</button>
                <button style={TAB_STYLE(tab === 'anual')} onClick={() => setTab('anual')}>Visão Anual</button>
            </div>

            {/* Filtros comuns */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>Congregação
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label>Ano <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} /></label>
                {tab === 'mensal' && (
                    <label>Mês
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
                            {monthCtl?.is_open === false ? 'Mês fechado' : 'Mês aberto'}
                        </span>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(true)}>Abrir mês</button>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(false)}>Fechar mês</button>
                    </>
                )}
            </div>

            {/* ── Mês Atual ── */}
            {tab === 'mensal' && (
                <>
                    {/* Badge: PE excluídos do S-1 (decisão 2026-07-10) */}
                    {(consolidation?.special_pioneer_count ?? 0) > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#1e293b', border: '1px solid #334155',
                            borderLeft: '3px solid #f59e0b',
                            borderRadius: 6, padding: '8px 12px',
                            fontSize: '0.8rem', color: '#94a3b8', marginBottom: 12,
                        }}>
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ S-1 congregacional</span>
                            {' '}—{' '}
                            <strong style={{ color: '#e2e8f0' }}>{consolidation?.special_pioneer_count} P. {consolidation!.special_pioneer_count === 1 ? 'Especial' : 'Especiais'}</strong>
                            {' '}excluído{consolidation!.special_pioneer_count === 1 ? '' : 's'} dos totais
                            (relatórios vão ao escritório da Filial, não à congregação).
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                        <Kpi label="Relatórios entregues" value={submitted} />
                        <Kpi label="Congregados" value={activeCount} />
                        <Kpi label="Publicadores" value={consolidation?.publisher_count ?? 0} />
                        <Kpi label="P. Auxiliares" value={consolidation?.auxiliary_pioneer_count ?? 0} />
                        <Kpi label="P. Regulares" value={consolidation?.regular_pioneer_count ?? 0} />
                        <Kpi label="Estudos" value={consolidation?.total_studies ?? 0} />
                        <Kpi label="Horas pioneiros" value={consolidation?.pioneer_hours ?? 0} />
                        <Kpi label="Atrasados" value={consolidation?.late_count ?? 0} />
                        {(consolidation?.special_pioneer_count ?? 0) > 0 && (
                            <Kpi
                                label="P. Especiais (circuito)"
                                value={consolidation?.special_pioneer_count ?? 0}
                            />
                        )}
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
                        {year} — {congName}
                    </h4>
                    {!hasSeriesData ? (
                        <div style={{
                            background: '#1e293b', borderRadius: 8, padding: '2rem',
                            textAlign: 'center', color: '#64748b',
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
                            <div>Sem dados para {year}.</div>
                            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                                Importe os relatórios na aba <strong>Sincronização</strong> para visualizar os gráficos.
                            </div>
                        </div>
                    ) : (
                        <>
                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8 }}>
                                Relatórios e modalidades de serviço por mês — Publicadores, Pioneiros Auxiliares e Regulares.
                            </p>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="Relatórios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Publicadores" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="P. Auxiliar" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="P. Regular" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Estudos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
