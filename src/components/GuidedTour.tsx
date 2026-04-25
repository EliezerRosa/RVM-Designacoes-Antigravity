/**
 * GuidedTour — componente genérico para tours guiados in-app.
 *
 * Recursos:
 *   • Highlight do elemento real da UI (driver.js) com máscara escura + halo.
 *   • Narração por Web Speech API (pt-BR) com play/pause/replay e velocidade
 *     0.5x → 2x.
 *   • Cada passo pode forçar um pré-passo (`onBeforeStep`) — útil p/ trocar
 *     abas, abrir submenus etc. antes de buscar o seletor.
 *   • Filtragem por papel: cada passo declara `editorRoles`; quando o papel
 *     atual não está na lista, o passo recebe um badge "👁️ Somente leitura"
 *     em vez de "✏️ Você edita".
 *
 * Uso típico (ver PublisherStatusForm para exemplo completo):
 *
 *   <GuidedTour
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     role={role}
 *     steps={MY_STEPS}
 *     storageKey="my_tutorial_<role>"
 *     onBeforeStep={(step) => { ... }}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface TourStep {
    /** Selector CSS do elemento a destacar. Se ausente, é mostrado como modal central. */
    selector?: string;
    title: string;
    /** Texto narrado e exibido no popover. */
    body: string;
    /** Papéis que EDITAM este campo. Outros papéis veem como só-leitura.
     *  Se ausente, o passo é informativo (não exibe badge). */
    editorRoles?: string[];
    /** Hook opcional executado ANTES de destacar este passo (ex.: trocar aba). */
    requireSetup?: () => void;
}

interface GuidedTourProps {
    open: boolean;
    onClose: () => void;
    /** Papel do usuário (qualquer string). Usado p/ decidir badge edit/view. */
    role: string;
    steps: TourStep[];
    /** Chave opcional p/ exibir contexto no popover (ex.: "Tutorial • Status"). */
    contextLabel?: string;
}

// ─── Web Speech helpers ─────────────────────────────────────────────────────
function pickPtBrVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
        voices.find(v => /pt[-_]br/i.test(v.lang)) ||
        voices.find(v => /^pt/i.test(v.lang)) ||
        null
    );
}

export function GuidedTour({ open, onClose, role, steps, contextLabel }: GuidedTourProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [rate, setRate] = useState<number>(1);
    const [muted, setMuted] = useState(false);
    const [paused, setPaused] = useState(false);
    const driverRef = useRef<Driver | null>(null);

    // Garante voices carregadas
    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const sync = () => {};
        window.speechSynthesis.onvoiceschanged = sync;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    const speak = useCallback((text: string) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        if (muted) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.rate = rate;
        u.pitch = 1;
        const voice = pickPtBrVoice();
        if (voice) u.voice = voice;
        setPaused(false);
        window.speechSynthesis.speak(u);
    }, [rate, muted]);

    const stopSpeaking = useCallback(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        setPaused(false);
    }, []);

    // Lifecycle
    useEffect(() => {
        if (!open) {
            driverRef.current?.destroy();
            driverRef.current = null;
            stopSpeaking();
            return;
        }
        driverRef.current = driver({
            showProgress: false,
            showButtons: ['close'],
            overlayColor: 'rgba(15, 23, 42, 0.75)',
            stagePadding: 6,
            stageRadius: 10,
            disableActiveInteraction: true,
            onCloseClick: () => { onClose(); },
            popoverClass: 'gt-tour-popover',
        });
        setStepIndex(0);
        return () => {
            driverRef.current?.destroy();
            driverRef.current = null;
            stopSpeaking();
        };
    }, [open, onClose, stopSpeaking]);

    // Renderiza passo
    const renderStep = useCallback((idx: number) => {
        const d = driverRef.current;
        if (!d) return;
        const step = steps[idx];
        if (!step) return;
        if (step.requireSetup) {
            try { step.requireSetup(); } catch { /* ignore */ }
        }

        const editable = !step.editorRoles || step.editorRoles.includes(role);
        const badge = step.editorRoles
            ? (editable
                ? '<span class="gt-tour-badge gt-tour-badge--edit">✏️ Você edita</span>'
                : '<span class="gt-tour-badge gt-tour-badge--view">👁️ Somente leitura</span>')
            : '';

        const description = `
            <div class="gt-tour-body">${step.body}</div>
            ${badge}
            <div class="gt-tour-progress">
                ${contextLabel ? `<em>${contextLabel}</em> · ` : ''}Passo ${idx + 1} de ${steps.length}
            </div>
        `;

        const delay = step.requireSetup ? 220 : 0;
        setTimeout(() => {
            const elementSelector = step.selector;
            const target = elementSelector ? document.querySelector(elementSelector) : null;
            if (elementSelector && !target) {
                d.highlight({
                    popover: { title: step.title, description, showButtons: ['close'] },
                });
            } else {
                d.highlight({
                    element: (elementSelector ?? undefined) as string | undefined,
                    popover: { title: step.title, description, showButtons: ['close'] },
                });
            }
            speak(`${step.title}. ${step.body}`);
        }, delay);
    }, [steps, role, contextLabel, speak]);

    useEffect(() => {
        if (!open) return;
        renderStep(stepIndex);
    }, [open, stepIndex, renderStep]);

    // Atalhos
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
            else if (e.key === 'ArrowRight') { setStepIndex(i => Math.min(i + 1, steps.length - 1)); }
            else if (e.key === 'ArrowLeft') { setStepIndex(i => Math.max(i - 1, 0)); }
            else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, steps.length]);

    const togglePause = () => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            setPaused(true);
        } else if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            setPaused(false);
        }
    };

    const replay = () => {
        const step = steps[stepIndex];
        if (step) speak(`${step.title}. ${step.body}`);
    };

    // Re-narra ao trocar velocidade/mute
    useEffect(() => {
        if (!open) return;
        const step = steps[stepIndex];
        if (step) speak(`${step.title}. ${step.body}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rate, muted]);

    if (!open) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    // Renderizamos via portal direto no <body> para escapar do stacking context
    // do modal pai (que poderia esconder o painel atrás do overlay do driver.js).
    const ui = (
        <>
            <style>{`
                .gt-tour-popover {
                    --driver-popover-bg: #ffffff;
                    --driver-popover-color: #1e293b;
                    border-radius: 12px !important;
                    box-shadow: 0 10px 40px rgba(15, 23, 42, 0.35) !important;
                    max-width: 420px !important;
                    z-index: 2147483602 !important;
                }
                .gt-tour-popover .driver-popover-title {
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                }
                .gt-tour-popover .driver-popover-description {
                    color: #334155 !important;
                    font-size: 13px !important;
                    line-height: 1.55 !important;
                }
                .gt-tour-body { margin-bottom: 8px; }
                .gt-tour-badge {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 700;
                    margin-bottom: 6px;
                }
                .gt-tour-badge--edit { background: #DCFCE7; color: #166534; }
                .gt-tour-badge--view { background: #FEF3C7; color: #92400E; }
                .gt-tour-progress { font-size: 11px; color: #94a3b8; margin-top: 6px; }
                .driver-popover-arrow { display: none !important; }
                .driver-overlay { z-index: 2147483600 !important; }
                .driver-popover { z-index: 2147483601 !important; }
                .driver-active-element { z-index: 2147483599 !important; }
            `}</style>

            <div
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1E293B',
                    color: 'white',
                    borderRadius: '14px',
                    padding: '10px 16px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    zIndex: 2147483603,
                    fontSize: '13px',
                    fontFamily: 'system-ui, sans-serif',
                    flexWrap: 'wrap',
                    maxWidth: 'calc(100vw - 32px)',
                }}
            >
                <button onClick={() => setStepIndex(i => Math.max(i - 1, 0))} disabled={isFirst} title="Passo anterior (←)" style={navBtn(isFirst)}>◀ Anterior</button>
                <span style={{ fontSize: '12px', color: '#cbd5e1', minWidth: '90px', textAlign: 'center' }}>
                    Passo {stepIndex + 1}/{steps.length}
                </span>
                <button onClick={() => setStepIndex(i => Math.min(i + 1, steps.length - 1))} disabled={isLast} title="Próximo passo (→)" style={navBtn(isLast, '#4F46E5')}>Próximo ▶</button>
                <span style={{ width: '1px', height: '20px', background: '#475569' }} />
                <button onClick={togglePause} title="Pausar/Retomar (Espaço)" style={iconBtn}>{paused ? '▶' : '⏸'}</button>
                <button onClick={replay} title="Repetir narração" style={iconBtn}>🔁</button>
                <button onClick={() => setMuted(m => !m)} title={muted ? 'Reativar áudio' : 'Mudo'} style={iconBtn}>{muted ? '🔇' : '🔊'}</button>
                <select
                    value={rate}
                    onChange={e => setRate(Number(e.target.value))}
                    title="Velocidade da narração"
                    style={{
                        background: '#0F172A', color: 'white', border: '1px solid #475569',
                        borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer',
                    }}
                >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                </select>
                <span style={{ width: '1px', height: '20px', background: '#475569' }} />
                <button onClick={onClose} title="Fechar tutorial (Esc)" style={{ ...iconBtn, background: '#EF4444' }}>✕ Fechar</button>
            </div>
        </>
    );

    if (typeof document === 'undefined') return ui;
    return createPortal(ui, document.body);
}

// ─── Helpers públicos ───────────────────────────────────────────────────────
export function tourSeenKey(scope: string, role: string): string {
    return `gt_seen_${scope}_${role}`;
}

// ─── Estilos auxiliares ─────────────────────────────────────────────────────
const navBtn = (disabled: boolean, bg = '#334155'): React.CSSProperties => ({
    background: disabled ? '#1F2937' : bg,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
});
const iconBtn: React.CSSProperties = {
    background: '#334155',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    cursor: 'pointer',
};
