/**
 * RmCongregationCrud — CRUD de rm.congregations.
 */
import { useEffect, useState } from 'react';
import { rmService, type RmCongregation } from '../../services/rm/rmService';

const emptyForm: Partial<RmCongregation> = { name: '', number: '', access_pin: '', is_active: true };

export function RmCongregationCrud() {
    const [rows, setRows] = useState<RmCongregation[]>([]);
    const [form, setForm] = useState<Partial<RmCongregation>>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = async () => {
        setLoading(true); setError(null);
        try { setRows(await rmService.listCongregations()); }
        catch (e) { setError(String((e as Error).message ?? e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { void reload(); }, []);

    const save = async () => {
        if (!form.name?.trim()) { setError('Nome é obrigatório'); return; }
        setError(null);
        try {
            await rmService.upsertCongregation(editingId ? { ...form, id: editingId } : form);
            setForm(emptyForm); setEditingId(null); await reload();
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };

    const edit = (c: RmCongregation) => { setForm(c); setEditingId(c.id); };
    const remove = async (id: string) => {
        if (!confirm('Excluir esta congregação? (cascata: grupos, publicadores, relatórios)')) return;
        try { await rmService.deleteCongregation(id); await reload(); }
        catch (e) { setError(String((e as Error).message ?? e)); }
    };

    return (
        <div style={{ padding: '1rem' }}>
            <h3>Congregações</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <input placeholder="Nome" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input placeholder="Número" value={form.number ?? ''} onChange={e => setForm({ ...form, number: e.target.value })} />
                <input placeholder="PIN de acesso" value={form.access_pin ?? ''} onChange={e => setForm({ ...form, access_pin: e.target.value })} />
                <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Ativa
                </label>
                <button className="btn-primary" onClick={save}>{editingId ? 'Atualizar' : 'Adicionar'}</button>
                {editingId && <button className="btn-secondary" onClick={() => { setForm(emptyForm); setEditingId(null); }}>Cancelar</button>}
            </div>
            {loading ? <p>Carregando…</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                        <th>Nome</th><th>Número</th><th>Ativa</th><th></th>
                    </tr></thead>
                    <tbody>
                        {rows.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td>{c.name}</td><td>{c.number ?? '—'}</td><td>{c.is_active ? '✓' : '—'}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                    <button className="btn-secondary" onClick={() => edit(c)}>Editar</button>{' '}
                                    <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => remove(c.id)}>Excluir</button>
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={4} style={{ color: '#94a3b8' }}>Nenhuma congregação.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>
    );
}
