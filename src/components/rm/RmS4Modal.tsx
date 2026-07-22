/**
 * RmS4Modal — Modal do S-4 (Relatório de Serviço de Campo) com layout visual
 * que reproduz o cartão de papel físico real usado pelas congregações.
 *
 * Os inputs ficam sobrepostos ao "papel", dando a sensação de preencher
 * diretamente o formulário físico.
 *
 * 100% desacoplado — usa apenas rmService e tipos de rm/.
 */
import { useEffect, useMemo, useState } from 'react';
import { rmService, type RmMonthlyReport, type RmPublisher } from '../../services/rm/rmService';

/* ─────────────── Constantes ─────────────── */

const MONTHS_FULL = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/* ─────────────── Props ─────────────── */

interface Props {
    /** Se fornecido, pré-seleciona o publicador (modo edição vindo do S-1). */
    publisher?: RmPublisher;
    /** Se fornecido, edita um relatório existente. */
    report?: RmMonthlyReport | null;
    /** Pré-seleciona ano/mês. */
    year?: number;
    month?: number;
    congregationId?: string;
    onClose: () => void;
    onSave?: (report: RmMonthlyReport) => void;
}

/* ─────────────── Componente ─────────────── */

export function RmS4Modal({ publisher, report, year, month, congregationId, onClose, onSave }: Props) {
    const now = new Date();

    /* ── State ─────────────────────────────────────── */
    const [pubs, setPubs] = useState<RmPublisher[]>([]);
    const [publisherId, setPublisherId] = useState(publisher?.id ?? '');
    const [refYear, setRefYear] = useState(year ?? now.getFullYear());
    const [refMonth, setRefMonth] = useState(month ?? now.getMonth() + 1);
    const [hasPreached, setHasPreached] = useState(report?.has_preached ?? true);
    const [hours, setHours] = useState(report?.hours?.toString() ?? '');
    const [studies, setStudies] = useState(report?.bible_studies?.toString() ?? '0');
    const [isAuxiliary, setIsAuxiliary] = useState(report?.is_auxiliary_pioneer ?? false);
    const [notes, setNotes] = useState(report?.notes ?? '');
    const [isLate, setIsLate] = useState(report?.is_late_report ?? false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    /* ── Carrega lista de publicadores quando publisher não é fixo ─── */
    useEffect(() => {
        if (!publisher) {
            rmService.listPublishers(congregationId).then(setPubs).catch(() => { });
        }
    }, [publisher, congregationId]);

    const selectedPub = useMemo(() => {
        if (publisher) return publisher;
        return pubs.find(p => p.id === publisherId);
    }, [publisher, pubs, publisherId]);

    const isPioneer = !!(selectedPub?.is_regular_pioneer || selectedPub?.is_special_pioneer || isAuxiliary);

    /* ── ESC para fechar ────────────────────────────── */
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    /* ── Salvar ─────────────────────────────────────── */
    const handleSave = async () => {
        if (!publisherId && !publisher) { setError('Selecione o publicador.'); return; }
        setBusy(true); setError(null);
        try {
            const pubId = publisher?.id ?? publisherId;
            const input: Partial<RmMonthlyReport> = {
                id: report?.id,
                publisher_id: pubId,
                congregation_id: congregationId ?? selectedPub?.congregation_id ?? null,
                group_id: selectedPub?.current_group_id ?? null,
                reference_year: refYear,
                reference_month: refMonth,
                has_preached: hasPreached,
                hours: isPioneer && hours !== '' ? Number(hours) : null,
                bible_studies: parseInt(studies, 10) || 0,
                is_auxiliary_pioneer: isAuxiliary,
                is_regular_pioneer: selectedPub?.is_regular_pioneer ?? false,
                is_special_pioneer: selectedPub?.is_special_pioneer ?? false,
                is_late_report: isLate,
                notes: notes || null,
                modalities: report?.modalities ?? [],
            };
            const saved = await rmService.upsertReport(input);
            setSuccess(true);
            onSave?.(saved);
            setTimeout(onClose, 600);
        } catch (e) {
            setError(String((e as Error).message ?? e));
            setBusy(false);
        }
    };

    /* ────────────────────── Render ────────────────────── */

    const publisherLabel = selectedPub
        ? (selectedPub.is_special_pioneer ? 'Pioneiro Especial'
            : selectedPub.is_regular_pioneer ? 'Pioneiro Regular'
                : isAuxiliary ? 'Pioneiro Auxiliar' : 'Publicador')
        : '';

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={cardShadowStyle}>
                {/* ═══════════ Cartão S-4 "Papel" ═══════════ */}
                <div style={paperStyle}>
                    {/* ── Cabeçalho ── */}
                    <div style={headerStyle}>
                        <div style={titleStyle}>RELATÓRIO DE SERVIÇO DE CAMPO</div>
                        <div style={subtitleStyle}>S-4</div>
                    </div>

                    <div style={separatorStyle} />

                    {/* ── Nome ── */}
                    <div style={fieldRowStyle}>
                        <span style={fieldLabelStyle}>Nome</span>
                        {publisher ? (
                            <div style={{ ...fieldValueStaticStyle, flex: 1 }}>
                                {publisher.name}
                                <span style={badgeStyle}>{publisherLabel}</span>
                            </div>
                        ) : (
                            <select
                                value={publisherId}
                                onChange={e => setPublisherId(e.target.value)}
                                style={{ ...inputOnPaperStyle, flex: 1 }}
                            >
                                <option value="">— selecione o publicador —</option>
                                {pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                    </div>

                    {/* ── Mês / Ano ── */}
                    <div style={fieldRowStyle}>
                        <span style={fieldLabelStyle}>Mês</span>
                        <select
                            value={refMonth}
                            onChange={e => setRefMonth(Number(e.target.value))}
                            style={{ ...inputOnPaperStyle, width: 130 }}
                            disabled={!!report}
                        >
                            {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        <span style={{ ...fieldLabelStyle, marginLeft: 16 }}>Ano</span>
                        <input
                            type="number"
                            value={refYear}
                            onChange={e => setRefYear(Number(e.target.value))}
                            style={{ ...inputOnPaperStyle, width: 72, textAlign: 'center' }}
                            disabled={!!report}
                        />
                    </div>

                    <div style={separatorStyle} />

                    {/* ── Participação ── */}
                    <label style={checkRowStyle}>
                        <span style={checkboxWrapStyle}>
                            <input
                                type="checkbox"
                                checked={hasPreached}
                                onChange={e => setHasPreached(e.target.checked)}
                                style={realCheckboxStyle}
                            />
                            <span style={{
                                ...customCheckStyle,
                                background: hasPreached ? '#2563eb' : '#fff',
                                borderColor: hasPreached ? '#2563eb' : '#94a3b8',
                            }}>
                                {hasPreached && <span style={checkmarkStyle}>✓</span>}
                            </span>
                        </span>
                        <span style={checkLabelStyle}>Participou no ministério de campo</span>
                    </label>

                    <label style={checkRowStyle}>
                        <span style={checkboxWrapStyle}>
                            <input
                                type="checkbox"
                                checked={isAuxiliary}
                                onChange={e => setIsAuxiliary(e.target.checked)}
                                style={realCheckboxStyle}
                            />
                            <span style={{
                                ...customCheckStyle,
                                background: isAuxiliary ? '#2563eb' : '#fff',
                                borderColor: isAuxiliary ? '#2563eb' : '#94a3b8',
                            }}>
                                {isAuxiliary && <span style={checkmarkStyle}>✓</span>}
                            </span>
                        </span>
                        <span style={checkLabelStyle}>Pioneiro auxiliar neste mês</span>
                    </label>

                    <div style={separatorStyle} />

                    {/* ── Campos numéricos ── */}
                    <div style={{ display: 'flex', gap: 24, padding: '8px 0' }}>
                        <div style={numFieldContainerStyle}>
                            <span style={numFieldLabelStyle}>Estudos Bíblicos</span>
                            <input
                                type="number"
                                min={0}
                                value={studies}
                                onChange={e => setStudies(e.target.value)}
                                disabled={!hasPreached}
                                style={numInputStyle}
                            />
                        </div>

                        {isPioneer && (
                            <div style={numFieldContainerStyle}>
                                <span style={numFieldLabelStyle}>Horas</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={hours}
                                    onChange={e => setHours(e.target.value)}
                                    disabled={!hasPreached}
                                    style={numInputStyle}
                                    placeholder="0"
                                />
                                <span style={pioneerNoteStyle}>somente para pioneiros</span>
                            </div>
                        )}
                    </div>

                    <div style={separatorStyle} />

                    {/* ── Observações ── */}
                    <div style={{ padding: '6px 0' }}>
                        <span style={fieldLabelStyle}>Observações</span>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            style={textareaOnPaperStyle}
                            placeholder="Anotações do secretário..."
                        />
                    </div>

                    {/* ── Atraso ── */}
                    <label style={{ ...checkRowStyle, paddingTop: 4 }}>
                        <span style={checkboxWrapStyle}>
                            <input
                                type="checkbox"
                                checked={isLate}
                                onChange={e => setIsLate(e.target.checked)}
                                style={realCheckboxStyle}
                            />
                            <span style={{
                                ...customCheckStyle,
                                width: 14, height: 14,
                                background: isLate ? '#dc2626' : '#fff',
                                borderColor: isLate ? '#dc2626' : '#94a3b8',
                            }}>
                                {isLate && <span style={{ ...checkmarkStyle, fontSize: 10, lineHeight: '14px' }}>✓</span>}
                            </span>
                        </span>
                        <span style={{ ...checkLabelStyle, fontSize: '0.78rem', color: '#78716c' }}>
                            Relatório atrasado (entregue após o fechamento do mês)
                        </span>
                    </label>
                </div>

                {/* ═══════════ Barra de ação (fora do papel) ═══════════ */}
                {error && (
                    <div style={errorBarStyle}>{error}</div>
                )}
                {success && (
                    <div style={successBarStyle}>✓ Relatório salvo com sucesso!</div>
                )}
                <div style={actionBarStyle}>
                    <button onClick={onClose} disabled={busy} style={cancelBtnStyle}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={busy || success} style={saveBtnStyle}>
                        {busy ? 'Salvando…' : success ? '✓ Salvo' : 'Salvar Relatório'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════
   Estilos — todo inline para isolamento completo
   ════════════════════════════════════════════════ */

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
};

const cardShadowStyle: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    animation: 's4SlideIn 0.25s ease-out',
};

const paperStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, #fefcf3 0%, #f5f0e1 50%, #ede8d4 100%)',
    borderRadius: 6,
    padding: '28px 28px 20px',
    boxShadow: `
        0 1px 3px rgba(0,0,0,0.08),
        0 8px 24px rgba(0,0,0,0.12),
        inset 0 1px 0 rgba(255,255,255,0.6)
    `,
    border: '1px solid #d6d0c4',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    color: '#1c1917',
    position: 'relative',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
    fontSize: '0.92rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#292524',
};

const subtitleStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    color: '#78716c',
    marginTop: 2,
    fontStyle: 'italic',
};

const separatorStyle: React.CSSProperties = {
    height: 1,
    background: 'linear-gradient(to right, transparent, #c8c0b4 20%, #c8c0b4 80%, transparent)',
    margin: '10px 0',
};

const fieldRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '6px 0',
};

const fieldLabelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#44403c',
    whiteSpace: 'nowrap',
};

const fieldValueStaticStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: '#1c1917',
    fontWeight: 500,
    borderBottom: '1px dotted #a8a29e',
    paddingBottom: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

const badgeStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    background: '#2563eb',
    color: '#fff',
    padding: '1px 8px',
    borderRadius: 10,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 600,
    letterSpacing: '0.02em',
};

const inputOnPaperStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    color: '#1c1917',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px dotted #a8a29e',
    outline: 'none',
    padding: '4px 4px 2px',
    transition: 'border-color 0.2s',
};

const checkRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 0',
    cursor: 'pointer',
    userSelect: 'none',
};

const checkboxWrapStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
};

const realCheckboxStyle: React.CSSProperties = {
    position: 'absolute',
    opacity: 0,
    width: 18,
    height: 18,
    cursor: 'pointer',
};

const customCheckStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    border: '2px solid #94a3b8',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
};

const checkmarkStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: '18px',
};

const checkLabelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: '#44403c',
};

const numFieldContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
};

const numFieldLabelStyle: React.CSSProperties = {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: '#44403c',
};

const numInputStyle: React.CSSProperties = {
    width: 72,
    fontSize: '1.2rem',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontWeight: 700,
    color: '#1c1917',
    textAlign: 'center',
    background: 'rgba(255,255,255,0.5)',
    border: '1.5px solid #c8c0b4',
    borderRadius: 4,
    padding: '6px 4px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
};

const pioneerNoteStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    color: '#a8a29e',
    fontStyle: 'italic',
};

const textareaOnPaperStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '0.85rem',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    color: '#1c1917',
    background: 'rgba(255,255,255,0.3)',
    border: '1px solid #d6d0c4',
    borderRadius: 4,
    padding: '6px 8px',
    outline: 'none',
    resize: 'vertical',
    marginTop: 6,
    lineHeight: 1.5,
    transition: 'border-color 0.2s',
};

const errorBarStyle: React.CSSProperties = {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '8px 16px',
    borderRadius: 6,
    marginTop: 10,
    fontSize: '0.85rem',
    fontFamily: 'system-ui, sans-serif',
};

const successBarStyle: React.CSSProperties = {
    background: '#14532d',
    color: '#86efac',
    padding: '8px 16px',
    borderRadius: 6,
    marginTop: 10,
    fontSize: '0.85rem',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
};

const actionBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 14,
};

const cancelBtnStyle: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#334155',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
    transition: 'background 0.15s',
};

const saveBtnStyle: React.CSSProperties = {
    padding: '10px 28px',
    borderRadius: 8,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
    transition: 'background 0.15s, transform 0.1s',
};
