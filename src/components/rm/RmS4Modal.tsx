/**
 * RmS4Modal — Reprodução visual IDÊNTICA ao cartão S-4 físico (S-4-T 11/23).
 *
 * Campos exatos do papel:
 *   • Nome: ___________
 *   • Mês: ___________
 *   • Marque se você participou em alguma modalidade do ministério durante o mês. [ ]
 *   • Estudos bíblicos  |__|
 *   • Horas (se for pioneiro auxiliar, regular, especial ou missionário em campo) |__|
 *   • Observações: ___________
 *   • S-4-T  11/23
 *
 * 100% desacoplado — usa apenas rmService e tipos de rm/.
 */
import { useEffect, useMemo, useState } from 'react';
import { rmService, type RmMonthlyReport, type RmPublisher } from '../../services/rm/rmService';

const MONTHS_FULL = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface Props {
    publisher?: RmPublisher;
    report?: RmMonthlyReport | null;
    year?: number;
    month?: number;
    congregationId?: string;
    onClose: () => void;
    onSave?: (report: RmMonthlyReport) => void;
}

export function RmS4Modal({ publisher, report, year, month, congregationId, onClose, onSave }: Props) {
    const now = new Date();

    const [pubs, setPubs] = useState<RmPublisher[]>([]);
    const [publisherId, setPublisherId] = useState(publisher?.id ?? '');
    const [refYear, setRefYear] = useState(year ?? now.getFullYear());
    const [refMonth, setRefMonth] = useState(month ?? now.getMonth() + 1);
    const [hasPreached, setHasPreached] = useState(report?.has_preached ?? false);
    const [hours, setHours] = useState(report?.hours?.toString() ?? '');
    const [studies, setStudies] = useState(report?.bible_studies?.toString() ?? '');
    const [notes, setNotes] = useState(report?.notes ?? '');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!publisher) {
            rmService.listPublishers(congregationId).then(setPubs).catch(() => {});
        }
    }, [publisher, congregationId]);

    const selectedPub = useMemo(() => {
        if (publisher) return publisher;
        return pubs.find(p => p.id === publisherId);
    }, [publisher, pubs, publisherId]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSave = async () => {
        if (!publisherId && !publisher) { setError('Selecione o publicador.'); return; }
        setBusy(true); setError(null);
        try {
            const pub = selectedPub;
            const input: Partial<RmMonthlyReport> = {
                id: report?.id,
                publisher_id: pub?.id ?? publisherId,
                congregation_id: congregationId ?? pub?.congregation_id ?? null,
                group_id: pub?.current_group_id ?? null,
                reference_year: refYear,
                reference_month: refMonth,
                has_preached: hasPreached,
                hours: hours !== '' ? Number(hours) : null,
                bible_studies: parseInt(studies, 10) || 0,
                is_auxiliary_pioneer: report?.is_auxiliary_pioneer ?? false,
                is_regular_pioneer: pub?.is_regular_pioneer ?? false,
                is_special_pioneer: pub?.is_special_pioneer ?? false,
                is_late_report: report?.is_late_report ?? false,
                notes: notes || null,
                modalities: report?.modalities ?? [],
            };
            const saved = await rmService.upsertReport(input);
            setSuccess(true);
            onSave?.(saved);
            setTimeout(onClose, 500);
        } catch (e) {
            setError(String((e as Error).message ?? e));
            setBusy(false);
        }
    };

    /* ═══════════ Render ═══════════ */

    return (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={cardWrapper}>

                {/* ══════ O CARTÃO S-4 ══════ */}
                <div style={paper}>

                    {/* Título */}
                    <div style={title}>RELATÓRIO DE SERVIÇO DE CAMPO</div>

                    {/* Nome */}
                    <div style={dottedRow}>
                        <span style={label}>Nome:</span>
                        {publisher ? (
                            <span style={handwritten}>{publisher.name}</span>
                        ) : (
                            <select
                                value={publisherId}
                                onChange={e => setPublisherId(e.target.value)}
                                style={selectOnDots}
                            >
                                <option value="">— selecione o publicador —</option>
                                {pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                        <span style={dots} />
                    </div>

                    {/* Mês */}
                    <div style={dottedRow}>
                        <span style={label}>Mês:</span>
                        <select
                            value={`${MONTHS_FULL[refMonth - 1]} de ${refYear}`}
                            onChange={e => {
                                const [mName, , y] = e.target.value.split(' ');
                                setRefMonth(MONTHS_FULL.indexOf(mName) + 1);
                                setRefYear(Number(y));
                            }}
                            style={selectOnDots}
                            disabled={!!report}
                        >
                            {/* últimos 24 meses */}
                            {Array.from({ length: 24 }, (_, i) => {
                                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                const lbl = `${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`;
                                return <option key={lbl} value={lbl}>{lbl}</option>;
                            })}
                        </select>
                        <span style={dots} />
                    </div>

                    {/* ── Tabela central ── */}
                    <div style={tableOuter}>

                        {/* Linha 1: Participação + checkbox */}
                        <div style={tableRow}>
                            <div style={{ ...tableCell, flex: 1, borderRight: '2px solid #000' }}>
                                Marque se você participou em alguma
                                <br />modalidade do ministério durante o mês.
                            </div>
                            <div
                                style={{ ...tableCell, width: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                onClick={() => setHasPreached(!hasPreached)}
                            >
                                <div style={checkboxBox}>
                                    {hasPreached && <span style={checkMark}>✓</span>}
                                </div>
                            </div>
                        </div>

                        {/* Linha 2: Estudos bíblicos */}
                        <div style={{ ...tableRow, borderTop: '2px solid #000' }}>
                            <div style={{ ...tableCell, flex: 1, borderRight: '2px solid #000' }}>
                                Estudos bíblicos
                            </div>
                            <div style={{ ...tableCell, width: 52, padding: 0 }}>
                                <input
                                    type="number"
                                    min={0}
                                    value={studies}
                                    onChange={e => setStudies(e.target.value)}
                                    style={numInput}
                                    placeholder="—"
                                />
                            </div>
                        </div>

                        {/* Linha 3: Horas */}
                        <div style={{ ...tableRow, borderTop: '2px solid #000' }}>
                            <div style={{ ...tableCell, flex: 1, borderRight: '2px solid #000', lineHeight: 1.35 }}>
                                Horas (se for pioneiro auxiliar, regular, especial
                                <br />ou missionário em campo)
                            </div>
                            <div style={{ ...tableCell, width: 52, padding: 0 }}>
                                <input
                                    type="number"
                                    min={0}
                                    value={hours}
                                    onChange={e => setHours(e.target.value)}
                                    style={numInput}
                                    placeholder="—"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Observações */}
                    <div style={obsBox}>
                        <div style={obsLabel}>Observações:</div>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            style={obsTextarea}
                        />
                    </div>

                    {/* Rodapé */}
                    <div style={footer}>S-4-T&nbsp;&nbsp;11/23</div>
                </div>

                {/* ══════ Ações (fora do papel) ══════ */}
                {error && <div style={errBar}>{error}</div>}
                {success && <div style={okBar}>✓ Relatório salvo!</div>}
                <div style={actions}>
                    <button onClick={onClose} disabled={busy} style={btnCancel}>Cancelar</button>
                    <button onClick={handleSave} disabled={busy || success} style={btnSave}>
                        {busy ? 'Salvando…' : success ? '✓ Salvo' : 'Salvar Relatório'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════
   Estilos inline — reprodução fiel do S-4
   ════════════════════════════════════════════ */

const overlay: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(3px)',
    zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
};

const cardWrapper: React.CSSProperties = {
    width: '100%', maxWidth: 520,
    animation: 's4SlideIn 0.2s ease-out',
};

const paper: React.CSSProperties = {
    background: '#fff',
    borderRadius: 4,
    padding: '32px 36px 24px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
    fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
    color: '#000',
    lineHeight: 1.4,
};

const title: React.CSSProperties = {
    fontSize: '1.15rem',
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: '0.04em',
    marginBottom: 24,
};

/* ── Nome / Mês com linha pontilhada ── */

const dottedRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
    position: 'relative',
};

const label: React.CSSProperties = {
    fontWeight: 700,
    fontSize: '0.95rem',
    whiteSpace: 'nowrap',
    flexShrink: 0,
};

const dots: React.CSSProperties = {
    flex: 1,
    borderBottom: '1.5px dotted #888',
    minWidth: 40,
    alignSelf: 'flex-end',
    marginBottom: 2,
};

const selectOnDots: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderBottom: '1.5px dotted #888',
    fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
    fontSize: '0.95rem',
    color: '#1a1a8a',
    outline: 'none',
    padding: '0 2px 1px',
    cursor: 'pointer',
    minWidth: 0,
    maxWidth: '70%',
};

const handwritten: React.CSSProperties = {
    fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
    fontSize: '0.95rem',
    color: '#1a1a8a',
    borderBottom: '1.5px dotted #888',
    paddingBottom: 1,
};

/* ── Tabela central ── */

const tableOuter: React.CSSProperties = {
    border: '2px solid #000',
    marginTop: 18,
    marginBottom: 18,
};

const tableRow: React.CSSProperties = {
    display: 'flex',
};

const tableCell: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '0.9rem',
    lineHeight: 1.4,
};

const checkboxBox: React.CSSProperties = {
    width: 24,
    height: 24,
    border: '2px solid #000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
};

const checkMark: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a1a8a',
    lineHeight: 1,
    fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
};

const numInput: React.CSSProperties = {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
    fontSize: '1.1rem',
    fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
    fontWeight: 700,
    color: '#1a1a8a',
    background: 'transparent',
    padding: '8px 4px',
    /* hide number spinners */
    MozAppearance: 'textfield',
};

/* ── Observações ── */

const obsBox: React.CSSProperties = {
    border: '2px solid #000',
    padding: '10px 12px',
    marginBottom: 18,
    minHeight: 60,
};

const obsLabel: React.CSSProperties = {
    fontSize: '0.9rem',
    marginBottom: 4,
};

const obsTextarea: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: '0.9rem',
    fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
    color: '#1a1a8a',
    background: 'transparent',
    lineHeight: 1.5,
    padding: 0,
};

/* ── Rodapé do formulário ── */

const footer: React.CSSProperties = {
    fontSize: '0.78rem',
    color: '#555',
    marginTop: 4,
};

/* ── Ações (fora do papel) ── */

const errBar: React.CSSProperties = {
    background: '#7f1d1d', color: '#fca5a5',
    padding: '8px 16px', borderRadius: 6,
    marginTop: 10, fontSize: '0.85rem',
    fontFamily: 'system-ui, sans-serif',
};

const okBar: React.CSSProperties = {
    background: '#14532d', color: '#86efac',
    padding: '8px 16px', borderRadius: 6,
    marginTop: 10, fontSize: '0.85rem',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
};

const actions: React.CSSProperties = {
    display: 'flex', gap: 12,
    justifyContent: 'flex-end', marginTop: 14,
};

const btnCancel: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 8,
    border: 'none', background: '#334155',
    color: '#e2e8f0', cursor: 'pointer',
    fontWeight: 600, fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
};

const btnSave: React.CSSProperties = {
    padding: '10px 28px', borderRadius: 8,
    border: 'none', background: '#2563eb',
    color: '#fff', cursor: 'pointer',
    fontWeight: 600, fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
};
