/**
 * RmDashboard ÔÇö KPIs de consolida├º├úo (S-1), progresso de entregas, abrir/fechar m├¬s.
 * Vis├úo Geral: s├®rie anual de servi├ºo com gr├íficos BarChart e PieChart (recharts).
 */
import { useEffect, useMemo, useState } from 'react';
import {
    Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell
} from 'recharts';
import {
    rmService,
    type RmCongregation, type RmMonthControl, type S1ConsolidationRow,
} from '../../services/rm/rmService';
import { RmS1View } from './RmS1View';

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_SERVICE = ['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

const MODALITY_COLORS: Record<string, string> = {
    'Casas': '#7c3aed',
    'Ruas': '#16a34a',
    'Com├®rcio': '#d946ef',
    'Informal': '#ef4444',
    'TP Local': '#f97316',
    'TP Betel': '#eab308',
    'Display': '#84cc16',
    'Video Confer├¬ncia': '#06b6d4',
    'Telefone': '#3b82f6',
    'Cartas': '#14b8a6',
    'Mensagens': '#6366f1',
    'Pesquisa Telefones': '#8b5cf6',
    'Revisitas': '#ec4899',
    'Dirigir Estudos': '#f43f5e'
};

function Kpi({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', minWidth: 130 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{label}</div>
        </div>
    );
}

type Tab = 'mensal' | 'anual' | 's1';

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: active ? '#3b82f6' : '#1e293b', color: '#fff', fontSize: '0.85rem',
});

export function RmDashboard() {
    const now = new Date();
    const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const defaultYear  = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();

    const [tab, setTab] = useState<Tab>('mensal');
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [congId, setCongId] = useState('');
    const [year, setYear] = useState(defaultYear);
    const [month, setMonth] = useState(defaultMonth);
    const [consolidation, setConsolidation] = useState<S1ConsolidationRow | null>(null);
    const [activeCount, setActiveCount] = useState(0);
    const [monthCtl, setMonthCtl] = useState<RmMonthControl | null>(null);
    
    // Anual Series
    const [series, setSeries] = useState<S1ConsolidationRow[]>([]);
    const [prevSeries, setPrevSeries] = useState<S1ConsolidationRow[]>([]);
    const [modalities, setModalities] = useState<any>(null);

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
            const [cur, prev, mods] = await Promise.all([
                rmService.getServiceYearConsolidationSeries(year, congId),
                rmService.getServiceYearConsolidationSeries(year - 1, congId),
                rmService.getServiceYearModalities(year, congId)
            ]);
            setSeries(cur);
            setPrevSeries(prev);
            setModalities(mods);
        } catch { 
            setSeries([]); setPrevSeries([]); setModalities(null); 
        }
    };
    useEffect(() => { void reloadSeries(); }, [congId, year]);

    const submitted = consolidation?.total_reports ?? 0;
    const pct = useMemo(() => activeCount > 0 ? Math.round((submitted / activeCount) * 100) : 0, [submitted, activeCount]);

    const buildChartData = (seriesData: S1ConsolidationRow[]) => {
        return MONTHS_SERVICE.map((mes, idx) => {
            const realMonth = idx < 4 ? idx + 9 : idx - 3;
            const row = seriesData.find(r => r.reference_month === realMonth);
            return {
                mes,
                Relat├│rios: row?.total_reports ?? 0,
                Publicadores: row?.publisher_count ?? 0,
                'P. Auxiliar': row?.auxiliary_pioneer_count ?? 0,
                'P. Regular': row?.regular_pioneer_count ?? 0,
                Estudos: row?.total_studies ?? 0,
            };
        });
    };

    const chartDataCur = useMemo(() => buildChartData(series), [series]);
    const chartDataPrev = useMemo(() => buildChartData(prevSeries), [prevSeries]);
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

    const renderBarChart = (data: any[]) => (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#e2e8f0' }} />
                {/* <Bar dataKey="Relat├│rios" fill="#3b82f6" radius={[4, 4, 0, 0]} /> */}
                <Bar dataKey="Publicadores" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="P. Auxiliar" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="P. Regular" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Estudos" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );

    const renderPieChart = (dataRecord: Record<string, number> | undefined, title: string) => {
        if (!dataRecord) return null;
        const total = Object.values(dataRecord).reduce((a, b) => a + b, 0);
        if (total === 0) return null;

        const data = Object.entries(dataRecord)
            .sort((a, b) => b[1] - a[1]) // Sort desc
            .map(([name, value]) => ({
                name,
                value,
                fill: MODALITY_COLORS[name] || '#64748b' // default fallback
            }));

        return (
            <div style={{ flex: 1, minWidth: 300, background: '#1e293b', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                <h5 style={{ margin: 0, marginBottom: 8, color: '#e2e8f0', fontSize: '1.05rem', textAlign: 'center' }}>{title}</h5>
                <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                        <Pie data={data} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 6, color: '#fff' }} itemStyle={{ color: '#fff' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        );
    };

    return (
        <div style={{ padding: '1rem' }}>
            <h3 style={{ marginBottom: 12 }}>Painel ÔÇö Relat├│rio Mensal</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button style={TAB_STYLE(tab === 'mensal')} onClick={() => setTab('mensal')}>M├¬s Atual</button>
                <button style={TAB_STYLE(tab === 's1')} onClick={() => setTab('s1')}>S-1 (Secret├írio)</button>
                <button style={TAB_STYLE(tab === 'anual')} onClick={() => setTab('anual')}>Vis├úo Geral</button>
            </div>

            {/* Filtros comuns */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>Congrega├º├úo
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label>{tab === 'anual' ? 'Ano de Servi├ºo' : 'Ano'} <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} /></label>
                {tab === 'mensal' && (
                    <label>M├¬s
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
                            {monthCtl?.is_open === false ? 'M├¬s fechado' : 'M├¬s aberto'}
                        </span>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(true)}>Abrir m├¬s</button>
                        <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(false)}>Fechar m├¬s</button>
                    </>
                )}
            </div>

            {/* ÔöÇÔöÇ M├¬s Atual ÔöÇÔöÇ */}
            {tab === 'mensal' && (
                <>
                    {/* Badge: PE exclu├¡dos do S-1 (decis├úo 2026-07-10) */}
                    {(consolidation?.special_pioneer_count ?? 0) > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#1e293b', border: '1px solid #334155',
                            borderLeft: '3px solid #f59e0b',
                            borderRadius: 6, padding: '8px 12px',
                            fontSize: '0.8rem', color: '#94a3b8', marginBottom: 12,
                        }}>
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>ÔÜá S-1 congregacional</span>
                            {' '}ÔÇö{' '}
                            <strong style={{ color: '#e2e8f0' }}>{consolidation?.special_pioneer_count} P. {consolidation!.special_pioneer_count === 1 ? 'Especial' : 'Especiais'}</strong>
                            {' '}exclu├¡do{consolidation!.special_pioneer_count === 1 ? '' : 's'} dos totais
                            (relat├│rios v├úo ao escrit├│rio da Filial, n├úo ├á congrega├º├úo).
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                        <Kpi label="Relat├│rios entregues" value={submitted} />
                        <Kpi label="Congregados" value={activeCount} />
                        <Kpi label="Publicadores" value={consolidation?.publisher_count ?? 0} />
                        <Kpi label="P. Auxiliares" value={consolidation?.auxiliary_pioneer_count ?? 0} />
                        <Kpi label="P. Regulares" value={consolidation?.regular_pioneer_count ?? 0} />
                        <Kpi label="Estudos" value={consolidation?.total_studies ?? 0} />
                        <Kpi label="Horas pioneiros" value={consolidation?.pioneer_hours ?? 0} />
                        <Kpi label="Atrasados" value={consolidation?.late_count ?? 0} />
                        {(consolidation?.special_pioneer_count ?? 0) > 0 && (
                            <Kpi
                                label="P. Especiais (Filial)"
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

            {/* ÔöÇÔöÇ Vis├úo Anual (Vis├úo Geral Glide) ÔöÇÔöÇ */}
            {tab === 'anual' && (
                <div>
                    {!hasSeriesData ? (
                        <div style={{
                            background: '#1e293b', borderRadius: 8, padding: '2rem',
                            textAlign: 'center', color: '#64748b',
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>­ƒôè</div>
                            <div>Sem dados para o Ano de Servi├ºo de {year}.</div>
                            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                                Importe os relat├│rios na aba <strong>Sincroniza├º├úo</strong> para visualizar os gr├íficos.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {/* Gr├ífico Atual */}
                            <div>
                                <h4 style={{ marginBottom: 4, color: '#e2e8f0', fontSize: '1.2rem' }}>
                                    Ano de Servi├ºo {year}
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 12 }}>
                                    Setembro de {year - 1} a Agosto de {year}
                                </p>
                                {renderBarChart(chartDataCur)}
                            </div>

                            {/* Gr├ífico Anterior */}
                            <div>
                                <h4 style={{ marginBottom: 4, color: '#e2e8f0', fontSize: '1.2rem' }}>
                                    AUGES (Anterior)
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 12 }}>
                                    Setembro de {year - 2} a Agosto de {year - 1}
                                </p>
                                {renderBarChart(chartDataPrev)}
                            </div>

                            {/* Gr├íficos de Rosca Modalidades */}
                            <div>
                                <h4 style={{ marginBottom: 12, color: '#e2e8f0', fontSize: '1.2rem' }}>
                                    Modalidades ({year})
                                </h4>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    {renderPieChart(modalities?.general, "Geral (Toda a Congrega├º├úo)")}
                                    {renderPieChart(modalities?.nonPioneers, "N├úo-Pioneiros")}
                                    {renderPieChart(modalities?.pioneers, "Pioneiros (Reg. + Aux.)")}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ÔöÇÔöÇ Vis├úo S-1 Escrit├│rio ÔöÇÔöÇ */}
            {tab === 's1' && (
                <div style={{ marginTop: 16 }}>
                    {congs.find(c => c.id === congId) && (
                        <RmS1View 
                            congregation={congs.find(c => c.id === congId)!}
                            year={year}
                            month={month}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
