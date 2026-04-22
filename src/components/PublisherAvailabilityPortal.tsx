/**
 * PublisherAvailabilityPortal â€” Self-service portal for individual publishers
 * to manage their own 2-month availability calendar by WEEK.
 *
 * Access via: ?portal=availability&token=<tok>
 * Token key in app_settings: 'availability_tokens'
 *
 * 3-state click cycle per week:
 *   default (grey/neutral) â†’ green (disponÃ­vel) â†’ red (indisponÃ­vel) â†’ default
 *
 * Availability is stored as week IDs (YYYY-MM-DD of Monday of the week), so it
 * is independent of which day the meeting actually falls on.
 *
 * Persists to publisher.availability via api.updatePublisher().
 * Changes are immediately consumed by isAvailableOnDate() in eligibilityService.
 * Before saving, checks for impediments in future workbook parts and shows
 * PublisherImpedimentModal (same flow as privilege/status changes).
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { getWeekMondayId } from '../services/eligibilityService';
import { findPublisherImpediments, type ImpedimentEntry } from '../services/publisherImpedimentService';
import { workbookManagementService } from '../services/workbookManagementService';
import { PublisherImpedimentModal } from './PublisherImpedimentModal';
import type { Publisher } from '../types';

// â”€â”€ Token structure (stored in app_settings key 'availability_tokens') â”€â”€â”€â”€â”€
export interface AvailabilityToken {
    token: string;
    publisherId: string;
    publisherName: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
}

// â”€â”€ Week state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type WeekState = 'default' | 'green' | 'red';
const CYCLE: Record<WeekState, WeekState> = { default: 'green', green: 'red', red: 'default' };

// â”€â”€ Date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return toYMD(d);
}

function formatPtBR(dateStr: string): string {
    // YYYY-MM-DD â†’ DD/MM
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}

/**
 * Returns week objects for the next ~9 weeks (current week + 8 more, 2 months ahead).
 * Each week: { weekId: YYYY-MM-DD (Monday), endDate: YYYY-MM-DD (Sunday) }
 */
function getUpcomingWeeks(today: string): { weekId: string; endDate: string }[] {
    const startMonday = getWeekMondayId(today);
    const twoMonthsLater = (() => {
        const d = new Date(today + 'T12:00:00');
        d.setMonth(d.getMonth() + 2);
        return toYMD(d);
    })();

    const weeks: { weekId: string; endDate: string }[] = [];
    let monday = startMonday;
    while (monday <= twoMonthsLater) {
        weeks.push({ weekId: monday, endDate: addDays(monday, 6) });
        monday = addDays(monday, 7);
    }
    return weeks;
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoadingScreen() {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
        }}>
            <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>â³</div>
                <p style={{ margin: 0 }}>Verificando acesso...</p>
            </div>
        </div>
    );
}

function UnauthorizedScreen() {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
        }}>
            <div style={{
                maxWidth: '480px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '32px',
                textAlign: 'center',
                color: '#E2E8F0',
            }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>ðŸ”’</div>
                <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 700 }}>
                    Link invÃ¡lido ou expirado
                </h2>
                <p style={{ margin: 0, color: '#94A3B8', lineHeight: 1.6, fontSize: '14px' }}>
                    Este link de disponibilidade nÃ£o Ã© vÃ¡lido ou foi revogado.
                    Entre em contato com o responsÃ¡vel pelas designaÃ§Ãµes para obter um novo link.
                </p>
            </div>
        </div>
    );
}

// â”€â”€ Main Portal Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface PublisherAvailabilityPortalProps {
    token?: string;
}

export function PublisherAvailabilityPortal({ token }: PublisherAvailabilityPortalProps) {
    const [status, setStatus] = useState<'validating' | 'unauthorized' | 'ready' | 'saving' | 'saved'>('validating');
    const [publisher, setPublisher] = useState<Publisher | null>(null);
    const [weekStates, setWeekStates] = useState<Map<string, WeekState>>(new Map());

    // Impediment modal state
    const [pendingImpediments, setPendingImpediments] = useState<{
        impediments: ImpedimentEntry[];
        proceedSave: () => Promise<void>;
    } | null>(null);

    const today = toYMD(new Date());
    const weeks = getUpcomingWeeks(today);

    // â”€â”€ Load and validate token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        if (!token) { setStatus('unauthorized'); return; }

        (async () => {
            try {
                const tokens = await api.getSetting<AvailabilityToken[]>('availability_tokens', []);
                const found = tokens.find(t => t.token === token && t.active);
                if (!found) { setStatus('unauthorized'); return; }

                const publishers = await api.loadPublishers();
                const pub = publishers.find(p => p.id === found.publisherId);
                if (!pub) { setStatus('unauthorized'); return; }

                setPublisher(pub);

                // Derive initial week states from existing availability
                const initial = new Map<string, WeekState>();
                if (pub.availability) {
                    const { mode, exceptionDates = [], availableDates = [] } = pub.availability;
                    if (mode === 'always') {
                        // Each stored exception = indisponÃ­vel (red)
                        exceptionDates.forEach(d => {
                            const wid = getWeekMondayId(d); // normalise old Thursday IDs too
                            if (weeks.some(w => w.weekId === wid)) initial.set(wid, 'red');
                        });
                    } else {
                        // Each stored available = disponÃ­vel (green)
                        availableDates.forEach(d => {
                            const wid = getWeekMondayId(d);
                            if (weeks.some(w => w.weekId === wid)) initial.set(wid, 'green');
                        });
                    }
                }
                setWeekStates(initial);
                setStatus('ready');
            } catch (err) {
                console.error('[AvailabilityPortal] Load error:', err);
                setStatus('unauthorized');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // â”€â”€ Toggle week state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleToggle = useCallback((weekId: string) => {
        setWeekStates(prev => {
            const next = new Map(prev);
            const current: WeekState = next.get(weekId) ?? 'default';
            const nextState = CYCLE[current];
            if (nextState === 'default') {
                next.delete(weekId);
            } else {
                next.set(weekId, nextState);
            }
            return next;
        });
    }, []);

    // â”€â”€ Build updated publisher object from current week states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const buildUpdatedPublisher = useCallback((pub: Publisher): Publisher => {
        const mode = pub.availability?.mode ?? 'always';
        const redWeeks = Array.from(weekStates.entries()).filter(([, s]) => s === 'red').map(([d]) => d);
        const greenWeeks = Array.from(weekStates.entries()).filter(([, s]) => s === 'green').map(([d]) => d);

        // For mode='always': exceptionDates = red weeks.
        //   Keep exceptions from OUTSIDE our 2-month window so we don't wipe old data.
        // For mode='never': availableDates = green weeks. Same logic for outside-window.
        const outsideWindowExceptions = (pub.availability?.exceptionDates ?? []).filter(d => {
            const wid = getWeekMondayId(d);
            return !weeks.some(w => w.weekId === wid);
        });
        const outsideWindowAvailables = (pub.availability?.availableDates ?? []).filter(d => {
            const wid = getWeekMondayId(d);
            return !weeks.some(w => w.weekId === wid);
        });

        return {
            ...pub,
            availability: {
                mode,
                exceptionDates: mode === 'always'
                    ? [...outsideWindowExceptions, ...redWeeks].sort()
                    : (pub.availability?.exceptionDates ?? []),
                availableDates: mode === 'never'
                    ? [...outsideWindowAvailables, ...greenWeeks].sort()
                    : (pub.availability?.availableDates ?? []),
            },
        };
    }, [weekStates, weeks]);

    // â”€â”€ Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleSave = async () => {
        if (!publisher) return;
        setStatus('saving');

        try {
            const updated = buildUpdatedPublisher(publisher);

            // Check impediments in future assigned parts
            const futureParts = await api.loadFutureWorkbookParts(publisher.name, today);

            const impediments = findPublisherImpediments(
                publisher,
                updated,
                futureParts,
                [publisher],
                getWeekMondayId(today),
            );

            if (impediments.length > 0) {
                setStatus('ready');
                setPendingImpediments({
                    impediments,
                    proceedSave: async () => {
                        setPendingImpediments(null);
                        await doSave(updated);
                    },
                });
                return;
            }

            await doSave(updated);
        } catch (err) {
            console.error('[AvailabilityPortal] Save error:', err);
            setStatus('ready');
            alert('Erro ao salvar. Tente novamente.');
        }
    };

    const doSave = async (updated: Publisher) => {
        await api.updatePublisher(updated);
        setPublisher(updated);
        setStatus('saved');
        setTimeout(() => setStatus('ready'), 3000);
    };

    // â”€â”€ Summary counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const redCount = Array.from(weekStates.values()).filter(s => s === 'red').length;
    const greenCount = Array.from(weekStates.values()).filter(s => s === 'green').length;

    // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (status === 'validating') return <LoadingScreen />;
    if (status === 'unauthorized') return <UnauthorizedScreen />;

    return (
        <>
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '24px 16px 48px',
        }}>
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>ðŸ“…</div>
                    <h1 style={{
                        color: '#F1F5F9',
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        margin: '0 0 6px',
                        letterSpacing: '-0.01em',
                    }}>
                        Minha Disponibilidade
                    </h1>
                    <div style={{ color: '#818CF8', fontWeight: 700, fontSize: '1rem' }}>
                        {publisher?.name}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '12px', marginTop: '8px', lineHeight: 1.6 }}>
                        Toque nas semanas para informar sua disponibilidade nos prÃ³ximos dois meses.
                    </div>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                    {([
                        { color: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', label: 'PadrÃ£o' },
                        { color: 'rgba(21,128,61,0.85)', border: 'none', label: 'âœ“ DisponÃ­vel' },
                        { color: 'rgba(185,28,28,0.85)', border: 'none', label: 'âœ— IndisponÃ­vel' },
                    ] as { color: string; border: string; label: string }[]).map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', fontSize: '12px' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: item.color, border: item.border, flexShrink: 0 }} />
                            {item.label}
                        </div>
                    ))}
                </div>

                {/* Week list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    {weeks.map(({ weekId, endDate }) => {
                        const state: WeekState = weekStates.get(weekId) ?? 'default';
                        const isPast = endDate < today;

                        let bg = 'rgba(99,102,241,0.1)';
                        let borderColor = 'rgba(99,102,241,0.25)';
                        let textColor = '#94A3B8';
                        let stateLabel = '';

                        if (state === 'green') {
                            bg = 'rgba(21,128,61,0.2)';
                            borderColor = '#15803D';
                            textColor = '#4ADE80';
                            stateLabel = 'âœ“ DisponÃ­vel';
                        } else if (state === 'red') {
                            bg = 'rgba(185,28,28,0.2)';
                            borderColor = '#B91C1C';
                            textColor = '#F87171';
                            stateLabel = 'âœ— IndisponÃ­vel';
                        }

                        return (
                            <div
                                key={weekId}
                                onClick={() => !isPast && handleToggle(weekId)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '14px 16px',
                                    borderRadius: '12px',
                                    background: isPast ? 'rgba(255,255,255,0.02)' : bg,
                                    border: `1px solid ${isPast ? 'rgba(255,255,255,0.05)' : borderColor}`,
                                    cursor: isPast ? 'default' : 'pointer',
                                    opacity: isPast ? 0.35 : 1,
                                    userSelect: 'none',
                                    transition: 'background 0.15s, border-color 0.15s',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ color: '#E2E8F0', fontWeight: 600, fontSize: '14px' }}>
                                        Semana de {formatPtBR(weekId)} a {formatPtBR(endDate)}
                                    </span>
                                    {isPast && (
                                        <span style={{ color: '#475569', fontSize: '11px' }}>semana passada</span>
                                    )}
                                </div>
                                <span style={{
                                    color: textColor,
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    minWidth: '80px',
                                    textAlign: 'right',
                                }}>
                                    {!isPast && (stateLabel || 'PadrÃ£o')}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Summary */}
                {(redCount > 0 || greenCount > 0) && (
                    <div style={{
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        marginBottom: '20px',
                        border: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        gap: '16px',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                    }}>
                        {greenCount > 0 && (
                            <span style={{ color: '#4ADE80', fontSize: '13px', fontWeight: 600 }}>
                                âœ“ {greenCount} semana{greenCount !== 1 ? 's' : ''} confirmada{greenCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        {redCount > 0 && (
                            <span style={{ color: '#F87171', fontSize: '13px', fontWeight: 600 }}>
                                âœ— {redCount} semana{redCount !== 1 ? 's' : ''} indisponÃ­vel{redCount !== 1 ? 'eis' : ''}
                            </span>
                        )}
                    </div>
                )}

                {/* Save button */}
                <div style={{ textAlign: 'center' }}>
                    <button
                        onClick={handleSave}
                        disabled={status === 'saving'}
                        style={{
                            background: status === 'saved' ? '#15803D' : '#4F46E5',
                            color: 'white',
                            border: 'none',
                            borderRadius: '14px',
                            padding: '16px 32px',
                            fontSize: '15px',
                            fontWeight: 700,
                            cursor: status === 'saving' ? 'not-allowed' : 'pointer',
                            width: '100%',
                            maxWidth: '360px',
                            transition: 'background 0.2s',
                            letterSpacing: '0.01em',
                            boxShadow: '0 4px 24px rgba(79,70,229,0.4)',
                        }}
                    >
                        {status === 'saving'
                            ? 'â³ Salvando...'
                            : status === 'saved'
                                ? 'âœ… Salvo com sucesso!'
                                : 'ðŸ’¾ Salvar disponibilidade'}
                    </button>

                    {status === 'saved' && (
                        <p style={{ color: '#4ADE80', fontSize: '13px', margin: '10px 0 0' }}>
                            Suas preferÃªncias foram registradas e jÃ¡ estÃ£o ativas.
                        </p>
                    )}

                    <p style={{ color: '#475569', fontSize: '11px', marginTop: '16px' }}>
                        As alteraÃ§Ãµes afetam apenas as designaÃ§Ãµes desta congregaÃ§Ã£o.
                    </p>
                </div>
            </div>
        </div>

        {/* Impediment confirmation modal */}
        {pendingImpediments && (
            <PublisherImpedimentModal
                publisherName={publisher?.name ?? ''}
                impediments={pendingImpediments.impediments}
                onConfirmAndCancel={async () => {
                    for (const { part } of pendingImpediments.impediments) {
                        try {
                            await workbookManagementService.updatePart(part.id, { resolvedPublisherName: '', status: 'PENDENTE' });
                        } catch { /* melhor esforÃ§o */ }
                    }
                    await pendingImpediments.proceedSave();
                }}
                onSaveOnly={() => { pendingImpediments.proceedSave(); }}
                onCancel={() => { setPendingImpediments(null); }}
            />
        )}
        </>
    );
}


