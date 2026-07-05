/**
 * RmSyncPortal — Portal de sincronização RM↔RVM.
 *  Fase A: casar rm.publishers com public.publishers (RVM).
 *  Fase B: atribuir líder/ajudante a grupos sem liderança, via sugestão por funcao.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { Publisher } from '../../types';
import { rmService, type RmFieldGroup, type RmPublisher } from '../../services/rm/rmService';
import { rmSyncService, type RmSyncMapRow } from '../../services/rm/rmSyncService';

export function RmSyncPortal() {
    const [phase, setPhase] = useState<'A' | 'B'>('A');
    const [rmPubs, setRmPubs] = useState<RmPublisher[]>([]);
    const [rvmPubs, setRvmPubs] = useState<Publisher[]>([]);
    const [syncMap, setSyncMap] = useState<RmSyncMapRow[]>([]);
    const [groups, setGroups] = useState<RmFieldGroup[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = async () => {
        setError(null);
        try {
            const [rp, vp, sm, gr] = await Promise.all([
                rmService.listPublishers(), api.loadPublishers(),
                rmSyncService.listSyncMap(), rmService.listFieldGroups(),
            ]);
            setRmPubs(rp); setRvmPubs(vp); setSyncMap(sm); setGroups(gr);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    useEffect(() => { void reload(); }, []);

    const rmName = useMemo(() => new Map(rmPubs.map(p => [p.id, p.name])), [rmPubs]);
    const syncByRm = useMemo(() => new Map(syncMap.map(s => [s.rm_publisher_id, s])), [syncMap]);

    const runAutoMatch = async () => {
        setBusy(true); setStatus(null); setError(null);
        try {
            const c = await rmSyncService.autoMatchAll();
            setStatus(`Auto-match: ${c.auto} automáticos, ${c.conflict} conflitos, ${c.unmatched} sem correspondência.`);
            await reload();
        } catch (e) { setError(String((e as Error).message ?? e)); }
        finally { setBusy(false); }
    };

    const confirm = async (rmId: string, rvmId: string) => {
        const rvm = rvmPubs.find(p => p.id === rvmId);
        if (!rvm) return;
        try { await rmSyncService.confirmMatch(rmId, rvmId, rvm.name); await reload(); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const clear = async (rmId: string) => {
        try { await rmSyncService.clearMatch(rmId); await reload(); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };

    const assignLeader = async (group: RmFieldGroup, publisherId: string, role: 'leader' | 'assistant') => {
        try {
            await rmService.upsertFieldGroup({
                id: group.id, congregation_id: group.congregation_id, group_number: group.group_number,
                ...(role === 'leader' ? { leader_id: publisherId } : { assistant_leader_id: publisherId }),
            });
            await reload();
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };

    const statusColor: Record<string, string> = {
        auto: '#3b82f6', 'admin-confirmed': '#22c55e', conflict: '#f59e0b', unmatched: '#94a3b8',
    };

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Portal de Sincronização</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            {status && <div style={{ color: '#22c55e', marginBottom: 8 }}>{status}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className={phase === 'A' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPhase('A')}>Fase A — Publicadores</button>
                <button className={phase === 'B' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPhase('B')}>Fase B — Líderes</button>
            </div>

            {phase === 'A' && (
                <>
                    <button className="btn-primary" disabled={busy} onClick={runAutoMatch} style={{ marginBottom: 12 }}>
                        {busy ? 'Processando…' : 'Rodar auto-match'}
                    </button>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                            <th>Publicador (RM)</th><th>Status</th><th>Correspondência RVM</th><th>Ação</th>
                        </tr></thead>
                        <tbody>
                            {rmPubs.map(rp => {
                                const s = syncByRm.get(rp.id);
                                const st = s?.match_status ?? 'unmatched';
                                return (
                                    <tr key={rp.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                        <td>{rp.name}</td>
                                        <td><span style={{ color: statusColor[st] }}>{st}</span></td>
                                        <td>{s?.matched_name ?? '—'}</td>
                                        <td>
                                            {st === 'admin-confirmed' ? (
                                                <button className="btn-secondary" onClick={() => clear(rp.id)}>Desfazer</button>
                                            ) : (
                                                <select defaultValue={s?.rvm_publisher_id ?? ''}
                                                    onChange={e => e.target.value && confirm(rp.id, e.target.value)}>
                                                    <option value="">— escolher RVM —</option>
                                                    {rvmPubs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                </select>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {rmPubs.length === 0 && <tr><td colSpan={4} style={{ color: '#94a3b8' }}>Nenhum publicador RM.</td></tr>}
                        </tbody>
                    </table>
                </>
            )}

            {phase === 'B' && (
                <div>
                    {groups.filter(g => !g.leader_id || !g.assistant_leader_id).map(g => {
                        const groupPubs = rmPubs.filter(p => p.current_group_id === g.id);
                        return (
                            <div key={g.id} style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                                <strong>Grupo {g.group_number}{g.name ? ` — ${g.name}` : ''}</strong>
                                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                                    <label>Líder: {g.leader_id ? rmName.get(g.leader_id) : (
                                        <select defaultValue="" onChange={e => e.target.value && assignLeader(g, e.target.value, 'leader')}>
                                            <option value="">— atribuir —</option>
                                            {groupPubs.map(p => <option key={p.id} value={p.id}>{p.name}{p.funcao ? ` (${p.funcao})` : ''}</option>)}
                                        </select>
                                    )}</label>
                                    <label>Ajudante: {g.assistant_leader_id ? rmName.get(g.assistant_leader_id) : (
                                        <select defaultValue="" onChange={e => e.target.value && assignLeader(g, e.target.value, 'assistant')}>
                                            <option value="">— atribuir —</option>
                                            {groupPubs.map(p => <option key={p.id} value={p.id}>{p.name}{p.funcao ? ` (${p.funcao})` : ''}</option>)}
                                        </select>
                                    )}</label>
                                </div>
                            </div>
                        );
                    })}
                    {groups.filter(g => !g.leader_id || !g.assistant_leader_id).length === 0 &&
                        <p style={{ color: '#94a3b8' }}>Todos os grupos têm líder e ajudante.</p>}
                </div>
            )}
        </div>
    );
}
