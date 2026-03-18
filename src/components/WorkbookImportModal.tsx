/**
 * WorkbookImportModal — Modal para importar apostila do jw.org
 * Busca, exibe prévia das partes e permite importar para o banco.
 */

import { useState, useCallback } from 'react';
import { fetchWorkbookFromJwOrg, importWorkbookFromJwOrg, importMultipleWeeks } from '../services/jwOrgService';
import type { JwFetchResult } from '../services/jwOrgService';
import type { WorkbookExcelRow } from '../services/workbookService';

interface Props {
    onClose: () => void;
    onDataChange?: () => void;
}

export function WorkbookImportModal({ onDataChange }: Props) {
    const [weekDate, setWeekDate] = useState('');
    const [weeksCount, setWeeksCount] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Preview state
    const [preview, setPreview] = useState<JwFetchResult | null>(null);

    // Import result
    const [importResult, setImportResult] = useState<string | null>(null);

    const handleFetchPreview = useCallback(async () => {
        if (!weekDate) { setError('Selecione a data da semana.'); return; }
        setLoading(true);
        setError(null);
        setPreview(null);
        setImportResult(null);

        try {
            const date = new Date(weekDate + 'T12:00:00');
            const result = await fetchWorkbookFromJwOrg(date);
            if (!result.success) {
                setError(result.error || 'Não foi possível buscar a apostila.');
            } else {
                setPreview(result);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro inesperado');
        } finally {
            setLoading(false);
        }
    }, [weekDate]);

    const handleImport = useCallback(async () => {
        if (!weekDate) return;
        setLoading(true);
        setError(null);
        setImportResult(null);

        try {
            const date = new Date(weekDate + 'T12:00:00');

            if (weeksCount > 1) {
                const results = await importMultipleWeeks(date, Math.min(weeksCount, 8));
                const ok = results.filter(r => r.success);
                const fail = results.filter(r => !r.success);
                let msg = `Importação de ${results.length} semanas:\n`;
                ok.forEach(r => { msg += `\n✅ ${r.weekDisplay}: ${r.totalParts} partes`; });
                fail.forEach(r => { msg += `\n❌ ${r.weekDisplay || 'Semana'}: ${r.error}`; });
                setImportResult(msg);
            } else {
                const result = await importWorkbookFromJwOrg(date);
                setImportResult(result.message);
            }

            setPreview(null);
            if (onDataChange) onDataChange();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro ao importar');
        } finally {
            setLoading(false);
        }
    }, [weekDate, weeksCount, onDataChange]);

    // Group preview parts by section (only Titular)
    const groupedParts = preview
        ? preview.parts
            .filter(p => p.funcao === 'Titular')
            .reduce<Record<string, WorkbookExcelRow[]>>((acc, p) => {
                const sec = p.section || 'Outros';
                if (!acc[sec]) acc[sec] = [];
                acc[sec].push(p);
                return acc;
            }, {})
        : {};

    const sectionColors: Record<string, string> = {
        'Tesouros da Palavra de Deus': '#8b6914',
        'Faça Seu Melhor no Ministério': '#b8860b',
        'Nossa Vida Cristã': '#a0522d',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Controls */}
            <div style={{
                display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
                padding: '16px', background: 'var(--bg-secondary, #f9fafb)',
                borderRadius: '10px', border: '1px solid var(--border-color, #e5e7eb)'
            }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Data da semana
                    </label>
                    <input
                        type="date"
                        value={weekDate}
                        onChange={e => { setWeekDate(e.target.value); setPreview(null); setImportResult(null); setError(null); }}
                        disabled={loading}
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid var(--border-color, #d1d5db)',
                            background: 'var(--bg-primary, #fff)',
                            color: 'var(--text-primary, #111)', fontSize: '0.95rem'
                        }}
                    />
                </div>

                <div style={{ minWidth: '110px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Semanas
                    </label>
                    <select
                        value={weeksCount}
                        onChange={e => setWeeksCount(Number(e.target.value))}
                        disabled={loading}
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid var(--border-color, #d1d5db)',
                            background: 'var(--bg-primary, #fff)',
                            color: 'var(--text-primary, #111)', fontSize: '0.95rem'
                        }}
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <option key={n} value={n}>{n} {n === 1 ? 'semana' : 'semanas'}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleFetchPreview}
                    disabled={loading || !weekDate}
                    style={{
                        padding: '8px 20px', borderRadius: '8px', border: 'none',
                        background: loading ? '#6b7280' : '#3b82f6',
                        color: '#fff', cursor: loading ? 'wait' : 'pointer',
                        fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap'
                    }}
                >
                    {loading ? '⏳ Buscando...' : '🔍 Buscar Prévia'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '12px 16px', borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444', fontSize: '0.9rem'
                }}>
                    ❌ {error}
                </div>
            )}

            {/* Import result */}
            {importResult && (
                <div style={{
                    padding: '12px 16px', borderRadius: '8px',
                    background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#22c55e', fontSize: '0.9rem', whiteSpace: 'pre-line'
                }}>
                    {importResult}
                </div>
            )}

            {/* Preview table */}
            {preview && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', background: 'rgba(59, 130, 246, 0.08)',
                        borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                        <div>
                            <strong style={{ color: 'var(--text-primary)' }}>{preview.weekDisplay}</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '0.9rem' }}>
                                {preview.totalParts} partes encontradas
                            </span>
                        </div>
                        <button
                            onClick={handleImport}
                            disabled={loading}
                            style={{
                                padding: '8px 24px', borderRadius: '8px', border: 'none',
                                background: loading ? '#6b7280' : '#22c55e',
                                color: '#fff', cursor: loading ? 'wait' : 'pointer',
                                fontWeight: '700', fontSize: '0.95rem'
                            }}
                        >
                            {loading ? '⏳ Importando...' : `✅ Importar ${weeksCount > 1 ? weeksCount + ' semanas' : ''}`}
                        </button>
                    </div>

                    {Object.entries(groupedParts).map(([section, parts]) => (
                        <div key={section} style={{
                            borderRadius: '8px', overflow: 'hidden',
                            border: '1px solid var(--border-color, #e5e7eb)'
                        }}>
                            <div style={{
                                padding: '8px 14px', fontWeight: '700', fontSize: '0.85rem',
                                color: '#fff', background: sectionColors[section] || '#6b7280',
                                letterSpacing: '0.03em'
                            }}>
                                {section}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-secondary, #f3f4f6)' }}>
                                        <th style={thStyle}>#</th>
                                        <th style={{ ...thStyle, textAlign: 'left' }}>Tipo / Título</th>
                                        <th style={thStyle}>Duração</th>
                                        <th style={thStyle}>Hora</th>
                                        <th style={thStyle}>Modalidade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parts.map((p, i) => (
                                        <tr key={i} style={{
                                            borderBottom: '1px solid var(--border-color, #e5e7eb)',
                                            background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary, #f9fafb)'
                                        }}>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{p.seq}</td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.tipoParte}</div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {p.tituloParte}
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>{p.duracao}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace' }}>
                                                {p.horaInicio}–{p.horaFim}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.82rem' }}>{p.modalidade}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!preview && !error && !importResult && !loading && (
                <div style={{
                    textAlign: 'center', padding: '40px 20px',
                    color: 'var(--text-muted)', fontSize: '0.95rem'
                }}>
                    <p style={{ fontSize: '2rem', marginBottom: '8px' }}>📥</p>
                    <p>Selecione uma data e clique em <strong>Buscar Prévia</strong> para ver as partes da apostila do jw.org.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                        A data pode ser qualquer dia da semana desejada. O sistema encontrará a semana da reunião automaticamente.
                    </p>
                </div>
            )}
        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontWeight: '600',
    fontSize: '0.82rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderBottom: '2px solid var(--border-color, #e5e7eb)',
};

const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    color: 'var(--text-primary)',
};
