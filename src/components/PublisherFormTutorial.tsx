/**
 * PublisherFormTutorial — Tour guiado do formulário de Atualização de Publicadores.
 *
 * Recursos:
 *   • Highlight do elemento real da UI (driver.js) com máscara escura + halo.
 *   • Narração por Web Speech API (pt-BR) com controles play/pause/replay e
 *     velocidade (0.5x → 2x).
 *   • Roteiro adapta-se ao papel do destinatário (CCA/SEC/SS/SRVM/AjSRVM/admin):
 *     passos só-leitura recebem badge "👁️ só leitura"; passos editáveis recebem
 *     "✏️ você edita".
 *   • Auto-abre na 1ª visita por papel (persistido em localStorage).
 *
 * MVP — voz do navegador (Web Speech). Para upgrade premium, basta substituir
 * `speak()` por <audio src=".../passo-N.mp3" />.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { PublisherFormRole } from './PublisherStatusForm';

type Role = PublisherFormRole | 'admin';

interface TourStep {
    /** Selector CSS do elemento a destacar. Se ausente, é um modal central. */
    selector?: string;
    /** Aba que precisa estar ativa (forçamos antes de mostrar). */
    requireSection?: 'status' | 'privileges' | 'sections';
    title: string;
    /** Texto narrado e exibido no popover. */
    body: string;
    /** Papéis que EDITAM este campo. Outros papéis veem como só-leitura. */
    editorRoles?: Role[];
}

// ─── Roteiro ────────────────────────────────────────────────────────────────
// Mantemos os passos comuns a todos os papéis. O badge muda conforme o papel.
const STEPS: TourStep[] = [
    {
        title: 'Boas-vindas 👋',
        body: 'Este formulário concentra a atualização de publicadores da congregação. Vou te mostrar, em cerca de dois minutos, como cada parte funciona — e quais campos você pode editar de acordo com seu papel.',
    },
    {
        selector: '[data-tour="role-badge"]',
        title: 'Seu papel',
        body: 'Aqui aparece o papel do link que você está usando — CCA, SEC, SS, SRVM ou Aj SRVM. As permissões dentro do formulário dependem desse papel.',
    },
    {
        selector: '[data-tour="search"]',
        title: 'Filtro de busca',
        body: 'Digite parte do nome do publicador para localizá-lo rapidamente. A lista é atualizada em tempo real.',
    },
    {
        selector: '[data-tour="tabs"]',
        title: 'Três sub-abas',
        body: 'Status de Participação, Privilégios e Por Seção. Cada uma agrupa um conjunto de campos. Vamos passar por todas.',
    },
    {
        selector: '[data-tour="col-isServing"]',
        requireSection: 'status',
        title: 'Em Serviço',
        body: 'Marca se o publicador está atualmente em serviço ativo. CCA e SEC podem editar; SRVM, Aj SRVM e SS apenas visualizam.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="col-notQualified"]',
        requireSection: 'status',
        title: 'Não Apto e Motivo',
        body: 'Quando ativado, abre o campo de motivo ao lado. CCA e SEC podem editar; demais papéis apenas visualizam.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="col-noParticip"]',
        requireSection: 'status',
        title: 'Pediu Não Participar e Motivo',
        body: 'Indica que o publicador pediu para não participar de designações por um período. Apenas SRVM e Aj SRVM podem editar essas colunas; CCA, SEC e SS apenas visualizam.',
        editorRoles: ['admin', 'SRVM', 'AjSRVM'],
    },
    {
        selector: '[data-tour="col-helperOnly"]',
        requireSection: 'status',
        title: 'Só Ajudante',
        body: 'Marca o publicador como elegível somente para o papel de ajudante em demonstrações. Apenas SRVM e Aj SRVM podem editar; demais papéis apenas visualizam.',
        editorRoles: ['admin', 'SRVM', 'AjSRVM'],
    },
    {
        selector: '[data-tour="tabs"]',
        requireSection: 'privileges',
        title: 'Aba Privilégios',
        body: 'Aqui você define quem pode presidir, dar discursos, orar, ler e dirigir o EBC. CCA e SEC editam; SRVM, Aj SRVM e SS apenas visualizam.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="tabs"]',
        requireSection: 'sections',
        title: 'Aba Por Seção',
        body: 'Define se o publicador participa de Tesouros, Ministério ou Vida Cristã. CCA e SEC editam; demais papéis apenas visualizam.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="btn-localneeds"]',
        title: 'Necessidades Locais',
        body: 'Abre o gerenciador da fila de Necessidades Locais. CCA e SEC têm CRUD completo; demais papéis abrem o modal em modo somente leitura.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="btn-events"]',
        title: 'Eventos Especiais',
        body: 'Abre o gerenciador de Eventos Especiais — assembleias, visitas, congressos. CCA e SEC têm CRUD; demais papéis apenas visualizam.',
        editorRoles: ['admin', 'CCA', 'SEC'],
    },
    {
        selector: '[data-tour="btn-save"]',
        title: 'Salvar em lote',
        body: 'Suas alterações ficam pendentes até você clicar em Salvar. O contador laranja mostra quantos publicadores foram modificados. Pronto, é isso! Você pode revisitar este tutorial pelo botão de interrogação no cabeçalho.',
    },
];

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

interface TutorialProps {
    role: Role;
    open: boolean;
    onClose: () => void;
    /** Permite forçar mudança de aba antes de cada passo. */
    onRequireSection?: (section: 'status' | 'privileges' | 'sections') => void;
}

export function PublisherFormTutorial({ role, open, onClose, onRequireSection }: TutorialProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [rate, setRate] = useState<number>(1);
    const [muted, setMuted] = useState(false);
    const [paused, setPaused] = useState(false);
    const driverRef = useRef<Driver | null>(null);
    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
    const voiceReadyRef = useRef(false);

    // Garante que o catálogo de vozes do navegador foi carregado
    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const sync = () => { voiceReadyRef.current = true; };
        sync();
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
        utterRef.current = u;
        setPaused(false);
        window.speechSynthesis.speak(u);
    }, [rate, muted]);

    const stopSpeaking = useCallback(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        setPaused(false);
    }, []);

    // ── Lifecycle: abre/fecha tour
    useEffect(() => {
        if (!open) {
            driverRef.current?.destroy();
            driverRef.current = null;
            stopSpeaking();
            return;
        }
        // Cria a instância driver.js (sem usar steps nativos — controlamos manualmente
        // para conseguir sincronizar com áudio e abas).
        driverRef.current = driver({
            showProgress: false,
            showButtons: ['close'],
            overlayColor: 'rgba(15, 23, 42, 0.75)',
            stagePadding: 6,
            stageRadius: 10,
            disableActiveInteraction: true,
            onCloseClick: () => { onClose(); },
            popoverClass: 'pf-tour-popover',
        });
        setStepIndex(0);
        return () => {
            driverRef.current?.destroy();
            driverRef.current = null;
            stopSpeaking();
        };
    }, [open, onClose, stopSpeaking]);

    // ── Renderiza passo atual sempre que index muda
    const renderStep = useCallback((idx: number) => {
        const d = driverRef.current;
        if (!d) return;
        const step = STEPS[idx];
        if (!step) return;
        if (step.requireSection && onRequireSection) onRequireSection(step.requireSection);

        const editable = !step.editorRoles || step.editorRoles.includes(role);
        const badge = step.editorRoles
            ? (editable
                ? '<span class="pf-tour-badge pf-tour-badge--edit">✏️ Você edita</span>'
                : '<span class="pf-tour-badge pf-tour-badge--view">👁️ Somente leitura</span>')
            : '';

        const description = `
            <div class="pf-tour-body">${step.body}</div>
            ${badge}
            <div class="pf-tour-progress">
                Passo ${idx + 1} de ${STEPS.length}
            </div>
        `;

        // Pequeno atraso para garantir que a aba foi trocada antes de procurar o seletor
        setTimeout(() => {
            const elementSelector = step.selector;
            const target = elementSelector ? document.querySelector(elementSelector) : null;
            if (elementSelector && !target) {
                // Selector não encontrado (ex.: aba ainda não montou). Mostra como modal.
                d.highlight({
                    popover: {
                        title: step.title,
                        description,
                        showButtons: ['close'],
                    },
                });
            } else {
                d.highlight({
                    element: (elementSelector ?? undefined) as string | undefined,
                    popover: {
                        title: step.title,
                        description,
                        showButtons: ['close'],
                    },
                });
            }
            // Narração
            const plain = `${step.title}. ${step.body}`;
            speak(plain);
        }, step.requireSection ? 200 : 0);
    }, [onRequireSection, role, speak]);

    useEffect(() => {
        if (!open) return;
        renderStep(stepIndex);
    }, [open, stepIndex, renderStep]);

    // ── Atalhos de teclado
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
            else if (e.key === 'ArrowRight') { setStepIndex(i => Math.min(i + 1, STEPS.length - 1)); }
            else if (e.key === 'ArrowLeft') { setStepIndex(i => Math.max(i - 1, 0)); }
            else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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
        const step = STEPS[stepIndex];
        if (step) speak(`${step.title}. ${step.body}`);
    };

    // ── Re-narra ao trocar velocidade ou mute
    useEffect(() => {
        if (!open) return;
        // Cancela e renarra com novo rate
        const step = STEPS[stepIndex];
        if (step) speak(`${step.title}. ${step.body}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rate, muted]);

    if (!open) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === STEPS.length - 1;

    // Painel de controles flutuante (separado do popover do driver.js)
    return (
        <>
            <style>{`
                .pf-tour-popover {
                    --driver-popover-bg: #ffffff;
                    --driver-popover-color: #1e293b;
                    border-radius: 12px !important;
                    box-shadow: 0 10px 40px rgba(15, 23, 42, 0.35) !important;
                    max-width: 420px !important;
                }
                .pf-tour-popover .driver-popover-title {
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                }
                .pf-tour-popover .driver-popover-description {
                    color: #334155 !important;
                    font-size: 13px !important;
                    line-height: 1.55 !important;
                }
                .pf-tour-body { margin-bottom: 8px; }
                .pf-tour-badge {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 700;
                    margin-bottom: 6px;
                }
                .pf-tour-badge--edit { background: #DCFCE7; color: #166534; }
                .pf-tour-badge--view { background: #FEF3C7; color: #92400E; }
                .pf-tour-progress { font-size: 11px; color: #94a3b8; margin-top: 6px; }
                .driver-popover-arrow { display: none !important; }
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
                    zIndex: 100000,
                    fontSize: '13px',
                    fontFamily: 'system-ui, sans-serif',
                    flexWrap: 'wrap',
                    maxWidth: 'calc(100vw - 32px)',
                }}
            >
                <button
                    onClick={() => setStepIndex(i => Math.max(i - 1, 0))}
                    disabled={isFirst}
                    title="Passo anterior (←)"
                    style={navBtn(isFirst)}
                >◀ Anterior</button>

                <span style={{ fontSize: '12px', color: '#cbd5e1', minWidth: '90px', textAlign: 'center' }}>
                    Passo {stepIndex + 1}/{STEPS.length}
                </span>

                <button
                    onClick={() => setStepIndex(i => Math.min(i + 1, STEPS.length - 1))}
                    disabled={isLast}
                    title="Próximo passo (→)"
                    style={navBtn(isLast, '#4F46E5')}
                >Próximo ▶</button>

                <span style={{ width: '1px', height: '20px', background: '#475569' }} />

                <button onClick={togglePause} title="Pausar/Retomar (Espaço)" style={iconBtn}>
                    {paused ? '▶' : '⏸'}
                </button>
                <button onClick={replay} title="Repetir narração" style={iconBtn}>
                    🔁
                </button>
                <button
                    onClick={() => setMuted(m => !m)}
                    title={muted ? 'Reativar áudio' : 'Mudo'}
                    style={iconBtn}
                >
                    {muted ? '🔇' : '🔊'}
                </button>
                <select
                    value={rate}
                    onChange={e => setRate(Number(e.target.value))}
                    title="Velocidade da narração"
                    style={{
                        background: '#0F172A',
                        color: 'white',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
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

                <button
                    onClick={onClose}
                    title="Fechar tutorial (Esc)"
                    style={{ ...iconBtn, background: '#EF4444' }}
                >
                    ✕ Fechar
                </button>
            </div>
        </>
    );
}

// ─── Helpers públicos: chave de "já viu" por papel ──────────────────────────
export function tutorialSeenKey(role: Role): string {
    return `pf_tutorial_seen_${role}`;
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
