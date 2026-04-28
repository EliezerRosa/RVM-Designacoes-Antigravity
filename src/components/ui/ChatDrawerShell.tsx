/**
 * ChatDrawerShell — Overlay drawers laterais para o Chat (Coluna 2).
 *
 * Filosofia IDD:
 *  - Conversa SEMPRE visível em largura plena (drawers são OVERLAY, não push).
 *  - Apenas UM painel aberto por vez (mutuamente exclusivos: abrir esquerdo
 *    fecha o direito e vice-versa).
 *  - Trilhos finos sempre visíveis nas bordas internas da coluna do chat.
 *  - Badge numérico Slack-style sinaliza sugestões pendentes quando fechado.
 *  - Esc fecha o aberto. Ctrl+[ alterna esquerdo, Ctrl+] alterna direito.
 *  - Cada lado pode receber UM ou DOIS "tipos" de conteúdo (slots empilhados
 *    verticalmente dentro do painel) — a divisão em coluna vertical acontece
 *    DENTRO do mesmo overlay.
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';

export type DrawerSide = 'left' | 'right';

/** Slot de conteúdo para um drawer (1 ou 2 por lado, empilhados verticalmente). */
export interface DrawerSlot {
    /** ID único do slot (para chave de render). */
    id: string;
    /** Título curto (header do bloco). */
    title: string;
    /** Ícone curto. */
    icon?: string;
    /** Conteúdo. */
    content: ReactNode;
    /** Badge numérico (sugestões pendentes). */
    badgeCount?: number;
}

export interface ChatDrawerShellProps {
    /** Conteúdo principal (a conversa do chat). */
    children: ReactNode;

    /** Slots do drawer esquerdo (1 ou 2). Vazio/null = trilho oculto. */
    leftSlots?: DrawerSlot[] | null;
    /** Rótulo curto para o trilho esquerdo (default: "Ações"). */
    leftRailLabel?: string;
    /** Ícone do trilho esquerdo (default: "💡"). */
    leftRailIcon?: string;

    /** Slots do drawer direito (1 ou 2). */
    rightSlots?: DrawerSlot[] | null;
    rightRailLabel?: string;
    rightRailIcon?: string;

    /** Chave de persistência em localStorage. */
    storageKey?: string;
}

type OpenSide = DrawerSide | null;

function readStored(key: string): OpenSide {
    try {
        const raw = localStorage.getItem(key);
        if (raw === 'left' || raw === 'right') return raw;
    } catch { /* ignore */ }
    return null;
}

function writeStored(key: string, val: OpenSide) {
    try {
        if (val === null) localStorage.removeItem(key);
        else localStorage.setItem(key, val);
    } catch { /* ignore */ }
}

export function ChatDrawerShell({
    children,
    leftSlots = null,
    leftRailLabel = 'Ações',
    leftRailIcon = '💡',
    rightSlots = null,
    rightRailLabel = 'Detalhes',
    rightRailIcon = '📋',
    storageKey = 'rvm_chat_drawer_open',
}: ChatDrawerShellProps) {
    const [open, setOpen] = useState<OpenSide>(() => readStored(storageKey));

    useEffect(() => {
        writeStored(storageKey, open);
    }, [open, storageKey]);

    const toggle = useCallback((side: DrawerSide) => {
        setOpen(prev => (prev === side ? null : side));
    }, []);

    const close = useCallback(() => setOpen(null), []);

    // Atalhos
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && open !== null) {
                e.preventDefault();
                close();
                return;
            }
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === '[') {
                e.preventDefault();
                toggle('left');
            } else if (e.key === ']') {
                e.preventDefault();
                toggle('right');
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, toggle, close]);

    const showLeft = !!(leftSlots && leftSlots.length > 0);
    const showRight = !!(rightSlots && rightSlots.length > 0);

    const leftBadge = (leftSlots ?? []).reduce((s, x) => s + (x.badgeCount ?? 0), 0);
    const rightBadge = (rightSlots ?? []).reduce((s, x) => s + (x.badgeCount ?? 0), 0);

    return (
        <div className="chat-drawer-shell" data-open={open ?? 'none'}>
            {/* Conversa — sempre full-width */}
            <div className="chat-drawer-shell__chat">{children}</div>

            {/* Trilho esquerdo (sempre visível) */}
            {showLeft && (
                <DrawerRail
                    side="left"
                    open={open === 'left'}
                    label={leftRailLabel}
                    icon={leftRailIcon}
                    badgeCount={leftBadge}
                    onToggle={() => toggle('left')}
                />
            )}

            {/* Trilho direito */}
            {showRight && (
                <DrawerRail
                    side="right"
                    open={open === 'right'}
                    label={rightRailLabel}
                    icon={rightRailIcon}
                    badgeCount={rightBadge}
                    onToggle={() => toggle('right')}
                />
            )}

            {/* Painel overlay esquerdo */}
            {showLeft && open === 'left' && (
                <DrawerPanel side="left" slots={leftSlots!} onClose={close} />
            )}

            {/* Painel overlay direito */}
            {showRight && open === 'right' && (
                <DrawerPanel side="right" slots={rightSlots!} onClose={close} />
            )}
        </div>
    );
}

// ---------- subcomponentes ----------

interface DrawerRailProps {
    side: DrawerSide;
    open: boolean;
    label: string;
    icon: string;
    badgeCount: number;
    onToggle: () => void;
}

function DrawerRail({ side, open, label, icon, badgeCount, onToggle }: DrawerRailProps) {
    const aria = open
        ? `Fechar painel ${label.toLowerCase()}`
        : badgeCount > 0
            ? `Abrir painel ${label.toLowerCase()} (${badgeCount} pendente${badgeCount > 1 ? 's' : ''})`
            : `Abrir painel ${label.toLowerCase()}`;
    return (
        <button
            type="button"
            className={`chat-drawer-shell__rail chat-drawer-shell__rail--${side}`}
            onClick={onToggle}
            title={aria}
            aria-label={aria}
            aria-expanded={open}
        >
            <span className="chat-drawer-shell__rail-icon">{icon}</span>
            <span className="chat-drawer-shell__rail-label">{label}</span>
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
    slots: DrawerSlot[];
    onClose: () => void;
}

function DrawerPanel({ side, slots, onClose }: DrawerPanelProps) {
    return (
        <aside
            className={`chat-drawer-shell__panel chat-drawer-shell__panel--${side}`}
            role="complementary"
        >
            <button
                type="button"
                className="chat-drawer-shell__panel-close"
                onClick={onClose}
                title="Fechar (Esc)"
                aria-label="Fechar painel"
            >
                ×
            </button>
            <div className="chat-drawer-shell__panel-stack">
                {slots.map((slot, idx) => (
                    <section
                        key={slot.id}
                        className="chat-drawer-shell__panel-section"
                        style={
                            // Quando há 2 slots, dividem o espaço em 50/50.
                            // Quando há 1, ocupa tudo (flex:1).
                            slots.length > 1 ? { flex: '1 1 0', minHeight: 0 } : { flex: '1 1 auto', minHeight: 0 }
                        }
                        data-section-index={idx}
                    >
                        <header className="chat-drawer-shell__panel-section-header">
                            {slot.icon && <span>{slot.icon}</span>}
                            <span>{slot.title}</span>
                            {(slot.badgeCount ?? 0) > 0 && (
                                <span className="chat-drawer-shell__section-badge">
                                    {slot.badgeCount}
                                </span>
                            )}
                        </header>
                        <div className="chat-drawer-shell__panel-section-body">
                            {slot.content}
                        </div>
                    </section>
                ))}
            </div>
        </aside>
    );
}

export default ChatDrawerShell;
