/**
 * RmPublisherCrud — CRUD de rm.publishers.
 * field_service_status é derivado por trigger (somente leitura aqui).
 */
import { useEffect, useState } from 'react';
import {
    rmService, type RmCongregation, type RmFieldGroup, type RmPublisher, type Gender,
} from '../../services/rm/rmService';

const emptyForm: Partial<RmPublisher> = {
    name: '', funcao: '', gender: null, is_regular_pioneer: false, is_special_pioneer: false, is_congregated: true,
};

export function RmPublisherCrud() {
    const [congs, setCongs] = useState<RmCongregation[]>([]);
    const [groups, setGroups] = useState<RmFieldGroup[]>([]);
    const [rows, setRows] = useState<RmPublisher[]>([]);
    const [congId, setCongId] = useState<string>('');
    const [form, setForm] = useState<Partial<RmPublisher>>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reloadBase = async () => {
        try {
            const c = await rmService.listCongregations();
            setCongs(c);
            if (!congId && c.length > 0) setCongId(c[0].id);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const reloadForCong = async (cid: string) => {
        if (!cid) { setRows([]); setGroups([]); return; }
        try {
            const [p, g] = await Promise.all([rmService.listPublishers(cid), rmService.listFieldGroups(cid)]);
            setRows(p); setGroups(g);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    useEffect(() => { void reloadBase(); }, []);
    useEffect(() => { void reloadForCong(congId); }, [congId]);

    const save = async () => {
        if (!form.name?.trim()) { setError('Nome é obrigatório'); return; }
        if (!congId) { setError('Selecione uma congregação'); return; }
        setError(null);
        try {
            await rmService.upsertPublisher({
                ...form,
                congregation_id: congId,
                ...(editingId ? { id: editingId } : {}),
            });
            setForm(emptyForm); setEditingId(null); await reloadForCong(congId);
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const edit = (p: RmPublisher) => { setForm(p); setEditingId(p.id); };
    const remove = async (id: string) => {
        if (!confirm('Excluir este publicador? (cascata: relatórios)')) return;
        try { await rmService.deletePublisher(id); await reloadForCong(congId); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };
    const groupName = (id: string | null) => groups.find(g => g.id === id)?.group_number ?? '—';

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Publicadores (RM)</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
                <label>Congregação:{' '}
                    <select value={congId} onChange={e => setCongId(e.target.value)}>
                        {congs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <input placeholder="Nome" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input placeholder="Função (Glide)" value={form.funcao ?? ''} onChange={e => setForm({ ...form, funcao: e.target.value })} />
                <select value={form.gender ?? ''} onChange={e => setForm({ ...form, gender: (e.target.value || null) as Gender | null })}>
                    <option value="">— Sexo —</option><option value="M">M</option><option value="F">F</option>
                </select>
                <select value={form.current_group_id ?? ''} onChange={e => setForm({ ...form, current_group_id: e.target.value || null })}>
                    <option value="">— Grupo —</option>
                    {groups.map(g => <option key={g.id} value={g.id}>Grupo {g.group_number}</option>)}
                </select>
                <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={form.is_regular_pioneer ?? false} onChange={e => setForm({ ...form, is_regular_pioneer: e.target.checked })} /> Pioneiro
                </label>
                <button className="btn-primary" onClick={save}>{editingId ? 'Atualizar' : 'Adicionar'}</button>
                {editingId && <button className="btn-secondary" onClick={() => { setForm(emptyForm); setEditingId(null); }}>Cancelar</button>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                    <th>Nome</th><th>Função</th><th>Grupo</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                    {rows.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td>{p.name}</td><td>{p.funcao ?? '—'}</td><td>{groupName(p.current_group_id)}</td>
                            <td>{p.field_service_status ?? '—'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn-secondary" onClick={() => edit(p)}>Editar</button>{' '}
                                <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => remove(p.id)}>Excluir</button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#94a3b8' }}>Nenhum publicador.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
