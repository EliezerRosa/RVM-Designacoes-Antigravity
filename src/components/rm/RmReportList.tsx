/**
 * RmReportList — lista de relatórios com filtro por mês/ano/publicador.
 */
import { useEffect, useMemo, useState } from 'react';
import { rmService, type RmMonthlyReport, type RmPublisher } from '../../services/rm/rmService';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function RmReportList() {
    const now = new Date();
    const [pubs, setPubs] = useState<RmPublisher[]>([]);
    const [rows, setRows] = useState<RmMonthlyReport[]>([]);
    const [year, setYear] = useState<number>(now.getFullYear());
    const [month, setMonth] = useState<number | ''>('');
    const [publisherId, setPublisherId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        rmService.listPublishers().then(setPubs).catch(e => setError(String((e as Error).message ?? e)));
    }, []);

    const reload = async () => {
        setLoading(true); setError(null);
        try {
            setRows(await rmService.listReports({
                reference_year: year,
                reference_month: month === '' ? undefined : month,
                publisher_id: publisherId || undefined,
            }));
        } catch (e) { setError(String((e as Error).message ?? e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { void reload(); }, [year, month, publisherId]);

    const pubName = useMemo(() => {
        const m = new Map(pubs.map(p => [p.id, p.name]));
        return (id: string) => m.get(id) ?? id;
    }, [pubs]);

    const remove = async (id: string) => {
        if (!confirm('Excluir este relatório?')) return;
        try { await rmService.deleteReport(id); await reload(); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Relatórios Mensais</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>Ano <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} /></label>
                <label>Mês
                    <select value={month} onChange={e => setMonth(e.target.value === '' ? '' : Number(e.target.value))}>
                        <option value="">Todos</option>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </label>
                <label>Publicador
                    <select value={publisherId} onChange={e => setPublisherId(e.target.value)}>
                        <option value="">Todos</option>
                        {pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
            </div>
            {loading ? <p>Carregando…</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                        <th>Publicador</th><th>Período</th><th>Pregou</th><th>Horas</th><th>Estudos</th><th>Atraso</th><th></th>
                    </tr></thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td>{pubName(r.publisher_id)}</td>
                                <td>{MONTHS[r.reference_month - 1]}/{r.reference_year}</td>
                                <td>{r.has_preached ? '✓' : '—'}</td>
                                <td>{r.hours ?? '—'}</td>
                                <td>{r.bible_studies}</td>
                                <td>{r.is_late_report ? '⚠️' : '—'}</td>
                                <td><button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => remove(r.id)}>Excluir</button></td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7} style={{ color: '#94a3b8' }}>Nenhum relatório.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>
    );
}
