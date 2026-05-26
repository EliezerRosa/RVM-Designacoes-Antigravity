import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { validatePublisherName } from '../../utils/publisherNameValidation';

/**
 * OrphanAuditPanel — auditoria de designações órfãs (2026-05-26)
 *
 * Lista todas as workbook_parts com raw_publisher_name preenchido mas SEM
 * resolved_publisher_id (FK nula). Agrupa por raw_name para facilitar correção
 * em lote. Marca em vermelho os que disparam heurística de "poluição do parser".
 *
 * Ações:
 * - 🧹 Limpar (em lote): zera raw_publisher_name e status=PENDENTE em todas
 *   as partes de um grupo. Útil quando o nome é claramente lixo do parser.
 * - 👁️ Inspecionar: mostra semanas/seq afetadas para investigação manual.
 */

interface OrphanRow {
    id: string;
    raw_publisher_name: string;
    week_id: string;
    seq: number;
    titulo_parte: string | null;
    year: number;
}

interface OrphanGroup {
    rawName: string;
    parts: OrphanRow[];
    looksInvalid: boolean;
    invalidReason?: string;
}

export function OrphanAuditPanel() {
    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState<OrphanGroup[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: qErr } = await supabase
                .from('workbook_parts')
                .select('id, raw_publisher_name, week_id, seq, titulo_parte, year')
                .is('resolved_publisher_id', null)
                .not('raw_publisher_name', 'is', null)
                .neq('raw_publisher_name', '')
                .order('week_id', { ascending: false });
            if (qErr) throw qErr;

            const byName = new Map<string, OrphanRow[]>();
            for (const row of (data ?? []) as OrphanRow[]) {
                const key = (row.raw_publisher_name || '').trim();
                if (!key) continue;
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key)!.push(row);
            }

            const result: OrphanGroup[] = [];
            byName.forEach((parts, rawName) => {
                const reason = validatePublisherName(rawName);
                result.push({
                    rawName,
                    parts,
                    looksInvalid: reason !== null,
                    invalidReason: reason?.description,
                });
            });
            // Inválidos primeiro, depois por qtd de partes desc
            result.sort((a, b) => {
                if (a.looksInvalid !== b.looksInvalid) return a.looksInvalid ? -1 : 1;
                return b.parts.length - a.parts.length;
            });
            setGroups(result);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const handleClearGroup = async (group: OrphanGroup) => {
        const ok = window.confirm(
            `Limpar ${group.parts.length} designação(ões) órfã(s) com raw_publisher_name="${group.rawName}"?\n\n` +
            `Cada parte será resetada (raw_publisher_name vazio, status=PENDENTE). Esta operação NÃO afeta o cadastro de publicadores.`
        );
        if (!ok) return;
        setBusyKey(group.rawName);
        try {
            const ids = group.parts.map(p => p.id);
            const { error: uErr } = await supabase
                .from('workbook_parts')
                .update({
                    raw_publisher_name: '',
                    resolved_publisher_id: null,
                    resolved_publisher_name: null,
                    status: 'PENDENTE',
                })
                .in('id', ids);
            if (uErr) throw uErr;
            await load();
        } catch (e: any) {
            window.alert('Falha ao limpar: ' + (e?.message ?? String(e)));
        } finally {
            setBusyKey(null);
        }
    };

    const toggleExpanded = (name: string) => {
        const next = new Set(expanded);
        if (next.has(name)) next.delete(name); else next.add(name);
        setExpanded(next);
    };

    const totalParts = groups.reduce((acc, g) => acc + g.parts.length, 0);
    const invalidGroups = groups.filter(g => g.looksInvalid);
    const invalidParts = invalidGroups.reduce((acc, g) => acc + g.parts.length, 0);

    return (
        <div style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <strong>📊 Resumo:</strong> {groups.length} grupo(s) órfão(s) · {totalParts} parte(s) afetada(s)
                    {invalidGroups.length > 0 && (
                        <span style={{ marginLeft: '12px', color: '#B91C1C', fontWeight: 600 }}>
                            🐛 {invalidGroups.length} grupo(s) com poluição do parser ({invalidParts} parte(s))
                        </span>
                    )}
                </div>
                <button
                    onClick={() => void load()}
                    disabled={loading}
                    style={{
                        background: '#3B82F6', color: '#FFF', border: 'none',
                        borderRadius: '6px', padding: '6px 12px', fontSize: '12px',
                        fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                    }}
                >
                    {loading ? 'Carregando…' : '🔄 Recarregar'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '10px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', marginBottom: '12px' }}>
                    ❌ {error}
                </div>
            )}

            {!loading && groups.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#059669', background: '#D1FAE5', borderRadius: '8px' }}>
                    ✅ Nenhuma designação órfã encontrada — todas as partes têm publicador resolvido.
                </div>
            )}

            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {groups.map(group => {
                    const isOpen = expanded.has(group.rawName);
                    const isBusy = busyKey === group.rawName;
                    return (
                        <div
                            key={group.rawName}
                            style={{
                                border: group.looksInvalid ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
                                background: group.looksInvalid ? '#FEF2F2' : '#FFF',
                                borderRadius: '6px',
                                padding: '10px',
                                marginBottom: '8px',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '13px', color: group.looksInvalid ? '#991B1B' : '#111827' }}>
                                        {group.looksInvalid ? '🐛' : '👤'} <code style={{ background: group.looksInvalid ? '#FECACA' : '#F3F4F6', padding: '0 4px', borderRadius: '3px' }}>{group.rawName}</code>
                                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6B7280', fontWeight: 400 }}>
                                            {group.parts.length} parte(s)
                                        </span>
                                    </div>
                                    {group.invalidReason && (
                                        <div style={{ fontSize: '11px', color: '#7F1D1D', marginTop: '2px' }}>
                                            Motivo: {group.invalidReason}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => toggleExpanded(group.rawName)}
                                        style={{
                                            background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB',
                                            borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
                                        }}
                                    >
                                        {isOpen ? '▲ Ocultar' : '▼ Inspecionar'}
                                    </button>
                                    <button
                                        onClick={() => void handleClearGroup(group)}
                                        disabled={isBusy}
                                        style={{
                                            background: isBusy ? '#FCA5A5' : '#DC2626', color: '#FFF',
                                            border: 'none', borderRadius: '4px', padding: '4px 8px',
                                            fontSize: '11px', fontWeight: 600,
                                            cursor: isBusy ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {isBusy ? 'Limpando…' : '🧹 Limpar lote'}
                                    </button>
                                </div>
                            </div>
                            {isOpen && (
                                <div style={{ marginTop: '8px', fontSize: '11px', maxHeight: '160px', overflowY: 'auto', background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '4px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                                                <th style={{ padding: '4px 6px' }}>Semana</th>
                                                <th style={{ padding: '4px 6px' }}>Seq</th>
                                                <th style={{ padding: '4px 6px' }}>Parte</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.parts.map(p => (
                                                <tr key={p.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '4px 6px' }}>{p.week_id}</td>
                                                    <td style={{ padding: '4px 6px' }}>{p.seq}</td>
                                                    <td style={{ padding: '4px 6px' }}>{p.titulo_parte || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
