/**
 * RmDashboard — KPIs de consolidação (S-1), progresso de entregas e abrir/fechar mês.
 */
import { useEffect, useMemo, useState } from 'react';
import {
    rmService, type RmCongregation, type RmMonthControl, type RmPublisher, type S1ConsolidationRow,
} from '../../services/rm/rmService';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function Kpi({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', minWidth: 130 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{label}</div>
        </div>
    );
}

export function RmDashboard() {
    const now = new Date();
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [congId, setCongId] = useState('');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [consolidation, setConsolidation] = useState<S1ConsolidationRow | null>(null);
    const [activeCount, setActiveCount] = useState(0);
    const [monthCtl, setMonthCtl] = useState<RmMonthControl | null>(null);
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

    const submitted = consolidation?.total_reports ?? 0;
    const pct = useMemo(() => activeCount > 0 ? Math.round((submitted / activeCount) * 100) : 0, [submitted, activeCount]);

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

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Painel — Relatório Mensal</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>Congregação
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label>Mês
                    <select value={month} onChange={e => setMonth(Number(e.target.value))}>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </label>
                <label>Ano <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} /></label>
                <span style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: monthCtl?.is_open === false ? '#7f1d1d' : '#14532d',
                    color: '#fff', fontSize: '0.8rem',
                }}>
                    {monthCtl?.is_open === false ? 'Mês fechado' : 'Mês aberto'}
                </span>
                <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(true)}>Abrir mês</button>
                <button className="btn-secondary" disabled={busy} onClick={() => toggleMonth(false)}>Fechar mês</button>
            </div>

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
        </div>
    );
}
