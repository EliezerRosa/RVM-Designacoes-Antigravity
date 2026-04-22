/**
 * PublisherAvailabilityPortal — Self-service portal for individual publishers
 * to manage their own 2-month availability calendar.
 *
 * Access via: ?portal=availability&token=<tok>
 * Token key in app_settings: 'availability_tokens'
 *
 * 3-state click cycle (Thursdays only, since the engine converts all dates to Thursday):
 *   default (grey) → green (disponível) → red (indisponível) → default
 *
 * Persists to publisher.availability via api.updatePublisher().
 * Changes are immediately consumed by isAvailableOnDate() in eligibilityService.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Publisher } from '../types';

// ── Token structure (stored in app_settings key 'availability_tokens') ─────
export interface AvailabilityToken {
    token: string;
    publisherId: string;
    publisherName: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
}

// ── Day state ────────────────────────────────────────────────────────────────
type DayState = 'default' | 'green' | 'red';
const CYCLE: Record<DayState, DayState> = { default: 'green', green: 'red', red: 'default' };

// ── Date helpers ─────────────────────────────────────────────────────────────
function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getDaysInMonth(year: number, month: number): { date: string; dayNum: number; weekDay: number }[] {
    const days: { date: string; dayNum: number; weekDay: number }[] = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
        days.push({ date: toYMD(d), dayNum: d.getDate(), weekDay: d.getDay() });
        d.setDate(d.getDate() + 1);
    }
    return days;
}

// ── Sub-components ────────────────────────────────────────────────────────────
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
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⏳</div>
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
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 700 }}>
                    Link inválido ou expirado
                </h2>
                <p style={{ margin: 0, color: '#94A3B8', lineHeight: 1.6, fontSize: '14px' }}>
                    Este link de disponibilidade não é válido ou foi revogado.
                    Entre em contato com o responsável pelas designações para obter um novo link.
                </p>
            </div>
        </div>
    );
}

interface MonthCalendarProps {
    year: number;
    month: number;
    today: string;
    dayStates: Map<string, DayState>;
    onToggle: (date: string) => void;
}

function MonthCalendar({ year, month, today, dayStates, onToggle }: MonthCalendarProps) {
    const MONTH_NAMES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const days = getDaysInMonth(year, month);
    const firstWeekDay = days[0].weekDay;

    // Build grid cells: leading empty slots + actual days
    const leadingBlanks = Array.from({ length: firstWeekDay }, (_, i) => ({ blank: true, key: `blank-${i}` }));

    return (
        <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '16px',
            border: '1px solid rgba(255,255,255,0.08)',
        }}>
            {/* Month title */}
            <div style={{
                color: '#E2E8F0',
                fontWeight: 700,
                fontSize: '15px',
                textAlign: 'center',
                marginBottom: '12px',
                letterSpacing: '0.02em',
            }}>
                {MONTH_NAMES[month]} {year}
            </div>

            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                {WEEK_DAYS.map(d => (
                    <div
                        key={d}
                        style={{
                            textAlign: 'center',
                            fontSize: '10px',
                            fontWeight: d === 'Qui' ? 700 : 400,
                            color: d === 'Qui' ? '#A5B4FC' : '#475569',
                            padding: '2px 0',
                            letterSpacing: '0.05em',
                        }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                {/* Leading blanks */}
                {leadingBlanks.map(b => <div key={b.key} />)}

                {/* Day tiles */}
                {days.map(({ date, dayNum, weekDay }) => {
                    const isThursday = weekDay === 4;
                    const isPast = date < today;
                    const state: DayState = dayStates.get(date) ?? 'default';
                    const isInteractive = isThursday && !isPast;

                    let bg = 'transparent';
                    let color = '#334155';
                    let border = 'none';
                    let cursor = 'default';

                    if (isThursday) {
                        if (isPast) {
                            bg = 'rgba(255,255,255,0.03)';
                            color = '#2D3748';
                        } else if (state === 'green') {
                            bg = '#15803D';
                            color = '#FFFFFF';
                        } else if (state === 'red') {
                            bg = '#B91C1C';
                            color = '#FFFFFF';
                        } else {
                            bg = 'rgba(99,102,241,0.2)';
                            color = '#A5B4FC';
                            border = '1px solid rgba(99,102,241,0.4)';
                        }
                        cursor = isInteractive ? 'pointer' : 'default';
                    }

                    return (
                        <div
                            key={date}
                            onClick={() => isInteractive && onToggle(date)}
                            title={isThursday && !isPast ? `${date} — clique para alternar` : undefined}
                            style={{
                                textAlign: 'center',
                                padding: '6px 0',
                                borderRadius: '8px',
                                fontSize: isThursday ? '13px' : '11px',
                                fontWeight: isThursday ? 700 : 400,
                                background: bg,
                                color,
                                border,
                                cursor,
                                userSelect: 'none',
                                transition: isInteractive ? 'background 0.15s, color 0.15s' : undefined,
                                opacity: !isThursday ? 0.35 : 1,
                            }}
                        >
                            {dayNum}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main Portal Component ─────────────────────────────────────────────────────
interface PublisherAvailabilityPortalProps {
    token?: string;
}

export function PublisherAvailabilityPortal({ token }: PublisherAvailabilityPortalProps) {
    const [status, setStatus] = useState<'validating' | 'unauthorized' | 'ready' | 'saving' | 'saved'>('validating');
    const [publisher, setPublisher] = useState<Publisher | null>(null);
    const [dayStates, setDayStates] = useState<Map<string, DayState>>(new Map());

    // ── Load and validate token ───────────────────────────────────────────
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

                // Derive initial day states from current availability
                const initial = new Map<string, DayState>();
                if (pub.availability) {
                    const { mode, exceptionDates = [], availableDates = [] } = pub.availability;
                    if (mode === 'always') {
                        exceptionDates.forEach(d => initial.set(d, 'red'));
                    } else {
                        availableDates.forEach(d => initial.set(d, 'green'));
                    }
                }
                setDayStates(initial);
                setStatus('ready');
            } catch (err) {
                console.error('[AvailabilityPortal] Load error:', err);
                setStatus('unauthorized');
            }
        })();
    }, [token]);

    // ── Calendar months (current + next) ──────────────────────────────────
    const today = toYMD(new Date());

    const months = (() => {
        const now = new Date();
        return [0, 1].map(offset => {
            const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });
    })();

    // ── Toggle day state ──────────────────────────────────────────────────
    const handleToggle = useCallback((date: string) => {
        setDayStates(prev => {
            const next = new Map(prev);
            const current: DayState = next.get(date) ?? 'default';
            const nextState = CYCLE[current];
            if (nextState === 'default') {
                next.delete(date);
            } else {
                next.set(date, nextState);
            }
            return next;
        });
    }, []);

    // ── Save ──────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!publisher) return;
        setStatus('saving');
        try {
            const mode = publisher.availability?.mode ?? 'always';
            const greenDates = Array.from(dayStates.entries())
                .filter(([, s]) => s === 'green')
                .map(([d]) => d);
            const redDates = Array.from(dayStates.entries())
                .filter(([, s]) => s === 'red')
                .map(([d]) => d);

            const updated: Publisher = {
                ...publisher,
                availability: {
                    mode,
                    exceptionDates: mode === 'always'
                        ? redDates
                        : (publisher.availability?.exceptionDates ?? []),
                    availableDates: mode === 'never'
                        ? greenDates
                        : (publisher.availability?.availableDates ?? []),
                },
            };

            await api.updatePublisher(updated);
            setPublisher(updated);
            setStatus('saved');
            setTimeout(() => setStatus('ready'), 3000);
        } catch (err) {
            console.error('[AvailabilityPortal] Save error:', err);
            setStatus('ready');
            alert('Erro ao salvar. Tente novamente.');
        }
    };

    // ── Summary counts ────────────────────────────────────────────────────
    const redCount = Array.from(dayStates.values()).filter(s => s === 'red').length;
    const greenCount = Array.from(dayStates.values()).filter(s => s === 'green').length;

    // ── Render ────────────────────────────────────────────────────────────
    if (status === 'validating') return <LoadingScreen />;
    if (status === 'unauthorized') return <UnauthorizedScreen />;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '24px 16px 48px',
        }}>
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📅</div>
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
                    <div style={{ color: '#64748B', fontSize: '12px', marginTop: '8px', lineHeight: 1.5 }}>
                        Toque nas <strong style={{ color: '#A5B4FC' }}>quintas-feiras</strong> para marcar sua disponibilidade
                        nos próximos dois meses.
                    </div>
                </div>

                {/* Legend */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    marginBottom: '24px',
                    flexWrap: 'wrap',
                }}>
                    {([
                        { color: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', label: 'Padrão (disponível)' },
                        { color: '#15803D', border: 'none', label: '✓ Confirmar disponível' },
                        { color: '#B91C1C', border: 'none', label: '✗ Indisponível' },
                    ] as { color: string; border: string; label: string }[]).map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', fontSize: '12px' }}>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '6px',
                                background: item.color,
                                border: item.border,
                                flexShrink: 0,
                            }} />
                            {item.label}
                        </div>
                    ))}
                </div>

                {/* Calendar months */}
                {months.map(({ year, month }) => (
                    <MonthCalendar
                        key={`${year}-${month}`}
                        year={year}
                        month={month}
                        today={today}
                        dayStates={dayStates}
                        onToggle={handleToggle}
                    />
                ))}

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
                                ✓ {greenCount} quinta{greenCount !== 1 ? 's' : ''} confirmada{greenCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        {redCount > 0 && (
                            <span style={{ color: '#F87171', fontSize: '13px', fontWeight: 600 }}>
                                ✗ {redCount} quinta{redCount !== 1 ? 's' : ''} indisponível{redCount !== 1 ? 'eis' : ''}
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
                            ? '⏳ Salvando...'
                            : status === 'saved'
                                ? '✅ Salvo com sucesso!'
                                : '💾 Salvar disponibilidade'}
                    </button>

                    {status === 'saved' && (
                        <p style={{ color: '#4ADE80', fontSize: '13px', marginTop: '10px', margin: '10px 0 0' }}>
                            Suas preferências foram registradas e já estão ativas.
                        </p>
                    )}

                    <p style={{ color: '#475569', fontSize: '11px', marginTop: '16px' }}>
                        As alterações afetam apenas as designações desta congregação.
                    </p>
                </div>
            </div>
        </div>
    );
}
