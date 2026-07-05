/**
 * RmFieldGroupCrud — CRUD de rm.field_groups (com seleção de congregação e líderes).
 */
import { useEffect, useState } from 'react';
import { rmService, type RmCongregation, type RmFieldGroup, type RmPublisher } from '../../services/rm/rmService';

const emptyForm: Partial<RmFieldGroup> = { group_number: 1, name: '', is_active: true };

export function RmFieldGroupCrud() {
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [pubs, setPubs] = useState<RmPublisher[]>([]);
    const [rows, setRows] = useState<RmFieldGroup[]>([]);
    const [congId, setCongId] = useState<string>('');
    const [form, setForm] = useState<Partial<RmFieldGroup>>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reloadBase = async () => {
        try {
            const [c, p] = await Promise.all([rmService.listCongregations(), rmService.listPublishers()]);
            setCongs(c); setPubs(p);
            if (!congId && c.length > 0) setCongId(c[0].id);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const reloadGroups = async (cid: string) => {
        if (!cid) { setRows([]); return; }
        try { setRows(await rmService.listFieldGroups(cid)); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };
    useEffect(() => { void reloadBase(); }, []);
    useEffect(() => { void reloadGroups(congId); }, [congId]);

    const groupPubs = pubs.filter(p => p.congregation_id === congId);

    const save = async () => {
        if (!congId) { setError('Selecione uma congregação'); return; }
        if (form.group_number == null) { setError('Número do grupo é obrigatório'); return; }
        setError(null);
        try {
            await rmService.upsertFieldGroup({
                ...form,
                congregation_id: congId,
                ...(editingId ? { id: editingId } : {}),
            });
            setForm(emptyForm); setEditingId(null); await reloadGroups(congId);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const edit = (g: RmFieldGroup) => { setForm(g); setEditingId(g.id); };
    const remove = async (id: string) => {
        if (!confirm('Excluir este grupo?')) return;
        try { await rmService.deleteFieldGroup(id); await reloadGroups(congId); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const pubName = (id: string | null) => pubs.find(p => p.id === id)?.name ?? '—';

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Grupos de Campo</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
                <label>Congregação:{' '}
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <input type="number" placeholder="Nº" style={{ width: 60 }} value={form.group_number ?? ''} onChange={e => setForm({ ...form, group_number: Number(e.target.value) })} />
                <input placeholder="Nome do grupo" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                <select value={form.leader_id ?? ''} onChange={e => setForm({ ...form, leader_id: e.target.value || null })}>
                    <option value="">— Líder —</option>
                    {groupPubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={form.assistant_leader_id ?? ''} onChange={e => setForm({ ...form, assistant_leader_id: e.target.value || null })}>
                    <option value="">— Ajudante —</option>
                    {groupPubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn-primary" onClick={save}>{editingId ? 'Atualizar' : 'Adicionar'}</button>
                {editingId && <button className="btn-secondary" onClick={() => { setForm(emptyForm); setEditingId(null); }}>Cancelar</button>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                    <th>Nº</th><th>Nome</th><th>Líder</th><th>Ajudante</th><th></th>
                </tr></thead>
                <tbody>
                    {rows.map(g => (
                        <tr key={g.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td>{g.group_number}</td><td>{g.name ?? '—'}</td>
                            <td>{pubName(g.leader_id)}</td><td>{pubName(g.assistant_leader_id)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn-secondary" onClick={() => edit(g)}>Editar</button>{' '}
                                <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => remove(g.id)}>Excluir</button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#94a3b8' }}>Nenhum grupo.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
