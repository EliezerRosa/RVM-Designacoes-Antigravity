import { useEffect, useState } from 'react';
import { rmService, type RmMonthlyReport, type RmPublisher } from '../../services/rm/rmService';

interface Props {
    publisher: RmPublisher;
    report: RmMonthlyReport | null;
    year: number;
    month: number;
    congregationId: string;
    onClose: () => void;
    onSave: (report: RmMonthlyReport) => void;
}

export function RmS1ReportEditModal({ publisher, report, year, month, congregationId, onClose, onSave }: Props) {
    const [hasPreached, setHasPreached] = useState(report ? report.has_preached : true);
    const [hours, setHours] = useState(report?.hours?.toString() ?? '');
    const [studies, setStudies] = useState(report?.bible_studies?.toString() ?? '0');
    const [isLate, setIsLate] = useState(report ? report.is_late_report : false);
    const [notes, setNotes] = useState(report?.notes ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Determines if publisher is a pioneer at the time of the report
    // If new report, we take current publisher status. If editing, we take the snapshot from the report.
    const isAux = report ? report.is_auxiliary_pioneer : false; // For now we assume no historical logic unless provided, actually we can just take it from publisher
    const isReg = report ? report.is_regular_pioneer : publisher.is_regular_pioneer;
    const isSpec = report ? report.is_special_pioneer : publisher.is_special_pioneer;

    const isPioneer = isAux || isReg || isSpec;

    // Handle escape key to close modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const input: Partial<RmMonthlyReport> = {
                id: report?.id, // se undefined, o upsert deve criar ou conflitar
                publisher_id: publisher.id,
                congregation_id: congregationId,
                reference_year: year,
                reference_month: month,
                has_preached: hasPreached,
                hours: isPioneer ? (parseInt(hours, 10) || 0) : null,
                bible_studies: parseInt(studies, 10) || 0,
                is_late_report: isLate,
                notes: notes || null,
                // If creating new, we must provide modality snapshots
                ...(report ? {} : {
                    is_auxiliary_pioneer: false, // We don't have this field in RmPublisher currently natively? Wait, it's not a boolean in RmPublisher, only is_regular and is_special. Aux is dynamic per month. We assume false if new, SC can adjust if needed in another screen, but for now we keep it simple.
                    is_regular_pioneer: publisher.is_regular_pioneer,
                    is_special_pioneer: publisher.is_special_pioneer,
                    modalities: []
                })
            };

            const saved = await rmService.upsertReport(input);
            onSave(saved);
        } catch (err) {
            setError(String((err as Error).message ?? err));
            setBusy(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: '#1e293b', borderRadius: 12, width: '100%', maxWidth: 450,
                padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                border: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>{publisher.name}</h3>
                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 4 }}>
                            {isReg ? 'Pioneiro Regular' : isSpec ? 'Pioneiro Especial' : isAux ? 'Pioneiro Auxiliar' : 'Publicador'}
                            {' '}• {month.toString().padStart(2, '0')}/{year}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: '0.9rem' }}>{error}</div>}

                <form onSubmit={handleSave}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '12px', background: '#0f172a', borderRadius: 8, cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={hasPreached} 
                            onChange={e => setHasPreached(e.target.checked)} 
                            style={{ width: 18, height: 18 }}
                        />
                        <span style={{ fontSize: '1rem', color: '#f8fafc' }}>Participou no ministério</span>
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: isPioneer ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
                        {isPioneer && (
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, color: '#cbd5e1', fontSize: '0.9rem' }}>Horas</label>
                                <input 
                                    type="number" 
                                    value={hours}
                                    onChange={e => setHours(e.target.value)}
                                    min="0"
                                    disabled={!hasPreached}
                                    style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                                />
                            </div>
                        )}
                        <div>
                            <label style={{ display: 'block', marginBottom: 6, color: '#cbd5e1', fontSize: '0.9rem' }}>Estudos Bíblicos</label>
                            <input 
                                type="number" 
                                value={studies}
                                onChange={e => setStudies(e.target.value)}
                                min="0"
                                disabled={!hasPreached}
                                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                            />
                        </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={isLate} 
                            onChange={e => setIsLate(e.target.checked)} 
                        />
                        <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Marcar como relatório atrasado (entregue após o fechamento)</span>
                    </label>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', marginBottom: 6, color: '#cbd5e1', fontSize: '0.9rem' }}>Observações (opcional)</label>
                        <textarea 
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#fff', resize: 'vertical' }}
                            placeholder="Anotações do Secretário..."
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button 
                            type="button" 
                            onClick={onClose}
                            disabled={busy}
                            style={{ padding: '10px 16px', borderRadius: 6, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            disabled={busy}
                            style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        >
                            {busy ? 'Salvando...' : 'Salvar Relatório'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
