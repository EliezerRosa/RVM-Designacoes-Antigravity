/**
 * RmReportForm — S-4 digital: registro/edição de um relatório mensal.
 * hours só habilita para pioneiro (regular/especial) ou pioneiro auxiliar.
 */
import { useEffect, useMemo, useState } from 'react';
import { rmService, type RmPublisher } from '../../services/rm/rmService';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MODALITY_OPTIONS = ['Casa em casa', 'Testemunho público', 'Cartas', 'Telefone', 'Revisitas', 'Informal'];

interface Props { onSaved?: () => void; }

export function RmReportForm({ onSaved }: Props) {
    const now = new Date();
    const [pubs, setPubs] = useState<RmPublisher[]>([]);
    const [publisherId, setPublisherId] = useState('');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [hasPreached, setHasPreached] = useState(true);
    const [hours, setHours] = useState<string>('');
    const [bibleStudies, setBibleStudies] = useState<string>('0');
    const [modalities, setModalities] = useState<string[]>([]);
    const [isAuxiliary, setIsAuxiliary] = useState(false);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    useEffect(() => {
        rmService.listPublishers().then(setPubs).catch(e => setError(String((e as Error).message ?? e)));
    }, []);

    const selectedPub = useMemo(() => pubs.find(p => p.id === publisherId), [pubs, publisherId]);
    const hoursEnabled = !!(selectedPub?.is_regular_pioneer || selectedPub?.is_special_pioneer || isAuxiliary);

    const toggleModality = (m: string) =>
        setModalities(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

    const save = async () => {
        setError(null); setOk(null);
        if (!publisherId) { setError('Selecione o publicador'); return; }
        try {
            await rmService.upsertReport({
                publisher_id: publisherId,
                congregation_id: selectedPub?.congregation_id ?? null,
                group_id: selectedPub?.current_group_id ?? null,
                reference_year: year,
                reference_month: month,
                has_preached: hasPreached,
                hours: hoursEnabled && hours !== '' ? Number(hours) : null,
                bible_studies: Number(bibleStudies) || 0,
                modalities,
                is_auxiliary_pioneer: isAuxiliary,
                notes: notes || null,
            });
            setOk('Relatório salvo.');
            onSaved?.();
        } catch (e) { setError(String((e as Error).message ?? e)); }
    };

    return (
        <div style={{ padding: '1rem', maxWidth: 560 }}>
            <h3>Relatório de Serviço de Campo (S-4)</h3>
            {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            {ok && <div style={{ color: '#22c55e', marginBottom: 8 }}>{ok}</div>}
            <div style={{ display: 'grid', gap: 10 }}>
                <label>Publicador
                    <select value={publisherId} onChange={e => setPublisherId(e.target.value)} style={{ width: '100%' }}>
                        <option value="">— selecione —</option>
                        {pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                    <label>Mês
                        <select value={month} onChange={e => setMonth(Number(e.target.value))}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </label>
                    <label>Ano
                        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90 }} />
                    </label>
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={hasPreached} onChange={e => setHasPreached(e.target.checked)} /> Participou no ministério
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={isAuxiliary} onChange={e => setIsAuxiliary(e.target.checked)} /> Pioneiro auxiliar neste mês
                </label>
                <label>Horas {hoursEnabled ? '' : '(somente pioneiros)'}
                    <input type="number" min={0} value={hours} disabled={!hoursEnabled}
                        onChange={e => setHours(e.target.value)} style={{ width: 120 }} />
                </label>
                <label>Estudos bíblicos
                    <input type="number" min={0} value={bibleStudies} onChange={e => setBibleStudies(e.target.value)} style={{ width: 120 }} />
                </label>
                <div>
                    <div style={{ marginBottom: 4 }}>Modalidades</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {MODALITY_OPTIONS.map(m => (
                            <label key={m} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="checkbox" checked={modalities.includes(m)} onChange={() => toggleModality(m)} /> {m}
                            </label>
                        ))}
                    </div>
                </div>
                <label>Observações
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%' }} />
                </label>
                <div><button className="btn-primary" onClick={save}>Salvar relatório</button></div>
            </div>
        </div>
    );
}
