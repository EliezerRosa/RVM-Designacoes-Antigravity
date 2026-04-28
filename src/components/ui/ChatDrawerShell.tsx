/**
 * ChatDrawerShell — Shell de drawers laterais para o Chat (Coluna 2 do PowerfulAgentTab).
 *
 * Filosofia IDD:
 *  - Agente NUNCA abre drawer/micro-UI sozinho. Apenas SUGERE.
 *  - Sugestão pendente = badge numérico (Slack-style) na borda do drawer fechado.
 *  - Usuário decide abrir; ao abrir, conversa é EMPURRADA (push).
 *  - Quando conversa fica muito estreita (< 320px efetivos), ela própria se RETRAI
 *    para um trilho lateral com 1 dica de retorno. Reabre por click/tap, ou
 *    automaticamente quando o drawer é fechado.
 *
 * Estados:
 *  - drawer fechado (collapsed)
 *  - drawer aberto + conversa empurrada (open, conversa visível)
 *  - drawer aberto + conversa retraída (open, conversa em trilho com tip de retorno)
 *
 * Persistência: estado de cada drawer em localStorage.
 * Atalhos: Ctrl+[ alterna esquerdo, Ctrl+] alterna direito, Esc fecha qualquer aberto.
 */

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';

export type DrawerSide = 'left' | 'right';

export interface ChatDrawerShellProps {
    /** Conteúdo principal (a conversa do chat). */
    children: ReactNode;

    /** Conteúdo do drawer esquerdo. Quando null, o trilho não é exibido. */
    leftContent?: ReactNode | null;
    /** Título curto do drawer esquerdo (ex.: "Ações Sugeridas"). */
    leftTitle?: string;
    /** Ícone do drawer esquerdo (ex.: "💡"). */
    leftIcon?: string;
    /** Nº de sugestões pendentes no esquerdo (badge Slack-style quando fechado). */
    leftBadgeCount?: number;

    /** Conteúdo do drawer direito (micro-UIs ativas, relatórios). */
    rightContent?: ReactNode | null;
    rightTitle?: string;
    rightIcon?: string;
    rightBadgeCount?: number;

    /** Chave para persistir estado em localStorage (default: 'rvm_chat_drawer'). */
    storageKey?: string;
}

type ChatPaneMode = 'expanded' | 'pushed' | 'collapsed';

// ---------- helpers de persistência ----------

function readStored(storageKey: string): { left: boolean; right: boolean } {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return { left: false, right: false };
        const parsed = JSON.parse(raw);
        return {
            left: !!parsed.left,
            right: !!parsed.right,
        };
    } catch {
        return { left: false, right: false };
    }
}

function writeStored(storageKey: string, state: { left: boolean; right: boolean }) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

// ---------- componente ----------

export function ChatDrawerShell({
    children,
    leftContent = null,
    leftTitle = 'Ações Sugeridas',
    leftIcon = '💡',
    leftBadgeCount = 0,
    rightContent = null,
    rightTitle = 'Detalhes',
    rightIcon = '📋',
    rightBadgeCount = 0,
    storageKey = 'rvm_chat_drawer',
}: ChatDrawerShellProps) {
    const initial = readStored(storageKey);
    const [leftOpen, setLeftOpen] = useState(initial.left);
    const [rightOpen, setRightOpen] = useState(initial.right);

    // Conversa retraída sob demanda do usuário (quando se sente apertada).
    // Inicia sempre como 'pushed' (visível) ao abrir um drawer; usuário pode
    // clicar no botão "compactar conversa" para virar 'collapsed'.
    const [chatPaneMode, setChatPaneMode] = useState<ChatPaneMode>('expanded');

    const containerRef = useRef<HTMLDivElement>(null);

    // Persistir estado dos drawers
    useEffect(() => {
        writeStored(storageKey, { left: leftOpen, right: rightOpen });
    }, [leftOpen, rightOpen, storageKey]);

    // Recalcula modo da conversa quando drawers mudam
    useEffect(() => {
        if (!leftOpen && !rightOpen) {
            setChatPaneMode('expanded');
        } else if (chatPaneMode === 'collapsed') {
            // mantém colapsada se usuário escolheu
        } else {
            setChatPaneMode('pushed');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leftOpen, rightOpen]);

    // Atalhos de teclado
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (!(e.ctrlKey || e.metaKey)) {
                if (e.key === 'Escape') {
                    if (rightOpen) setRightOpen(false);
                    else if (leftOpen) setLeftOpen(false);
                }
                return;
            }
            if (e.key === '[') {
                e.preventDefault();
                setLeftOpen(v => !v);
            } else if (e.key === ']') {
                e.preventDefault();
                setRightOpen(v => !v);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [leftOpen, rightOpen]);

    const toggleSide = useCallback((side: DrawerSide) => {
        if (side === 'left') setLeftOpen(v => !v);
        else setRightOpen(v => !v);
    }, []);

    // Restaurar conversa do estado 'collapsed'
    const restoreChat = useCallback(() => {
        setChatPaneMode(leftOpen || rightOpen ? 'pushed' : 'expanded');
    }, [leftOpen, rightOpen]);

    // Compactar conversa (trilho)
    const collapseChat = useCallback(() => {
        if (leftOpen || rightOpen) setChatPaneMode('collapsed');
    }, [leftOpen, rightOpen]);

    const showLeftRail = leftContent !== null;
    const showRightRail = rightContent !== null;

    return (
        <div
            ref={containerRef}
            className="chat-drawer-shell"
            data-left-open={leftOpen ? 'true' : 'false'}
            data-right-open={rightOpen ? 'true' : 'false'}
            data-chat-mode={chatPaneMode}
        >
            {/* Trilho esquerdo (sempre visível quando há conteúdo) */}
            {showLeftRail && (
                <DrawerRail
                    side="left"
                    open={leftOpen}
                    title={leftTitle}
                    icon={leftIcon}
                    badgeCount={leftBadgeCount}
                    onToggle={() => toggleSide('left')}
                />
            )}

            {/* Drawer esquerdo */}
            {showLeftRail && leftOpen && (
                <DrawerPanel
                    side="left"
                    title={leftTitle}
                    icon={leftIcon}
                    onClose={() => toggleSide('left')}
                >
                    {leftContent}
                </DrawerPanel>
            )}

            {/* Conversa */}
            <div className={`chat-drawer-shell__pane chat-drawer-shell__pane--${chatPaneMode}`}>
                {chatPaneMode === 'collapsed' ? (
                    <CollapsedChatTip onRestore={restoreChat} />
                ) : (
                    <>
                        {/* Botão flutuante para compactar quando empurrada */}
                        {chatPaneMode === 'pushed' && (
                            <button
                                type="button"
                                className="chat-drawer-shell__compact-btn"
                                title="Compactar conversa para focar no painel lateral"
                                onClick={collapseChat}
                            >
                                ⇲ compactar conversa
                            </button>
                        )}
                        {children}
                    </>
                )}
            </div>

            {/* Drawer direito */}
            {showRightRail && rightOpen && (
                <DrawerPanel
                    side="right"
                    title={rightTitle}
                    icon={rightIcon}
                    onClose={() => toggleSide('right')}
                >
                    {rightContent}
                </DrawerPanel>
            )}

            {/* Trilho direito */}
            {showRightRail && (
                <DrawerRail
                    side="right"
                    open={rightOpen}
                    title={rightTitle}
                    icon={rightIcon}
                    badgeCount={rightBadgeCount}
                    onToggle={() => toggleSide('right')}
                />
            )}
        </div>
    );
}

// ---------- subcomponentes ----------

interface DrawerRailProps {
    side: DrawerSide;
    open: boolean;
    title: string;
    icon: string;
    badgeCount: number;
    onToggle: () => void;
}

function DrawerRail({ side, open, title, icon, badgeCount, onToggle }: DrawerRailProps) {
    const arrow = side === 'left' ? (open ? '◀' : '▶') : open ? '▶' : '◀';
    const ariaLabel = open
        ? `Fechar painel ${title.toLowerCase()}`
        : badgeCount > 0
        ? `Abrir painel ${title.toLowerCase()} (${badgeCount} nova${badgeCount > 1 ? 's' : ''} sugest${badgeCount > 1 ? 'ões' : 'ão'})`
        : `Abrir painel ${title.toLowerCase()}`;

    return (
        <button
            type="button"
            className={`chat-drawer-shell__rail chat-drawer-shell__rail--${side}`}
            onClick={onToggle}
            title={ariaLabel}
            aria-label={ariaLabel}
            aria-expanded={open}
        >
            <span className="chat-drawer-shell__rail-arrow">{arrow}</span>
            <span className="chat-drawer-shell__rail-icon">{icon}</span>
            <span className="chat-drawer-shell__rail-label">{title}</span>
            {!open && badgeCount > 0 && (
                <span className="chat-drawer-shell__badge" aria-hidden="true">
                    {badgeCount > 99 ? '99+' : badgeCount}
                </span>
            )}
        </button>
    );
}

interface DrawerPanelProps {
    side: DrawerSide;
    title: string;
    icon: string;
    onClose: () => void;
    children: ReactNode;
}

function DrawerPanel({ side, title, icon, onClose, children }: DrawerPanelProps) {
    return (
        <aside
            className={`chat-drawer-shell__panel chat-drawer-shell__panel--${side}`}
            role="complementary"
            aria-label={title}
        >
            <header className="chat-drawer-shell__panel-header">
                <span>
                    {icon} {title}
                </span>
                <button
                    type="button"
                    className="chat-drawer-shell__panel-close"
                    onClick={onClose}
                    title="Fechar painel"
                    aria-label="Fechar painel"
                >
                    ✕
                </button>
            </header>
            <div className="chat-drawer-shell__panel-body">{children}</div>
        </aside>
    );
}

function CollapsedChatTip({ onRestore }: { onRestore: () => void }) {
    return (
        <button
            type="button"
            className="chat-drawer-shell__chat-tip"
            onClick={onRestore}
            title="Voltar à conversa"
            aria-label="Voltar à conversa"
        >
            <span className="chat-drawer-shell__chat-tip-icon">💬</span>
            <span className="chat-drawer-shell__chat-tip-label">voltar à conversa</span>
            <span className="chat-drawer-shell__chat-tip-hint">click ou Esc</span>
        </button>
    );
}

export default ChatDrawerShell;
