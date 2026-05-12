/**
 * LeftPanelActions — Painel ESQUERDO (drawer "Ações") do Chat-Agente IDD.
 *
 * Princípio IDD: toda "carga de ação" sai do inline do chat (chips acima do
 * input, post-response actions sob a bolha) e migra para este painel overlay.
 * O usuário vê a conversa em largura plena; quando precisa agir, abre o
 * trilho esquerdo (Ctrl+[) e encontra TUDO catalogado em 3 blocos.
 *
 * Blocos:
 *   1. "Para esta semana"      — contextualChips do hook semanticControls.
 *   2. "Ações sugeridas"       — postResponseActions da última msg do agente.
 *   3. "Comandos rápidos"      — visibleSlashCommands (catálogo de slashes).
 *
 * Cada bloco é colapsável e some quando vazio.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ChatActionChipItem } from './ChatActionChips';
import type { PostResponseActionItem } from './PostResponseActions';
import type { SlashCommandItem } from './SlashCommandMenu';
void React;

export interface LeftPanelActionsProps {
    chips: ChatActionChipItem[];
    suggestedActions: PostResponseActionItem[];
    slashCommands: SlashCommandItem[];
    /** Callback opcional para o trilho exibir badge de total. */
    onBadgeCountChange?: (count: number) => void;
}

type BlockId = 'week' | 'suggested' | 'commands';

interface BlockSpec {
    id: BlockId;
    title: string;
    icon: string;
    count: number;
    body: React.ReactNode;
}

export function LeftPanelActions({
    chips,
    suggestedActions,
    slashCommands,
    onBadgeCountChange,
}: LeftPanelActionsProps) {
    // Por padrão: blocos com itens começam abertos.
    const [collapsed, setCollapsed] = useState<Record<BlockId, boolean>>({
        week: false,
        suggested: false,
        commands: true, // catálogo grande — começa fechado
    });

    const totalCount = chips.length + suggestedActions.length;

    useEffect(() => {
        onBadgeCountChange?.(totalCount);
    }, [totalCount, onBadgeCountChange]);

    const blocks = useMemo<BlockSpec[]>(() => {
        const list: BlockSpec[] = [];

        if (chips.length > 0) {
            list.push({
                id: 'week',
                title: 'Para esta semana',
                icon: '📅',
                count: chips.length,
                body: (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {chips.map(chip => (
                            <button
                                key={chip.id}
                                onClick={chip.onClick}
                                style={chipBtnStyle(chip.tone === 'accent')}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                ),
            });
        }

        if (suggestedActions.length > 0) {
            list.push({
                id: 'suggested',
                title: 'Ações sugeridas',
                icon: '💡',
                count: suggestedActions.length,
                body: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {suggestedActions.map(action => (
                            <button
                                key={action.id}
                                onClick={action.onClick}
                                style={postActionBtnStyle(action.variant)}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                ),
            });
        }

        if (slashCommands.length > 0) {
            list.push({
                id: 'commands',
                title: 'Comandos rápidos',
                icon: '⌘',
                count: slashCommands.length,
                body: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {slashCommands.map(cmd => (
                            <button
                                key={cmd.id}
                                onClick={cmd.onSelect}
                                style={slashBtnStyle}
                                title={cmd.description}
                            >
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3730A3' }}>
                                    {cmd.command}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '8px' }}>
                                    {cmd.description}
                                </span>
                            </button>
                        ))}
                    </div>
                ),
            });
        }

        return list;
    }, [chips, suggestedActions, slashCommands]);

    if (blocks.length === 0) {
        return (
            <div style={{ fontSize: '12px', opacity: 0.7, padding: '8px 4px' }}>
                Nenhuma ação sugerida no momento. Continue a conversa que sugestões aparecerão aqui.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {blocks.map(block => {
                const isCollapsed = collapsed[block.id];
                return (
                    <section key={block.id} style={sectionStyle}>
                        <button
                            onClick={() => setCollapsed(c => ({ ...c, [block.id]: !c[block.id] }))}
                            style={sectionHeaderStyle}
                            aria-expanded={!isCollapsed}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{block.icon}</span>
                                <span style={{ fontWeight: 700, fontSize: '12px', color: '#1F2937' }}>
                                    {block.title}
                                </span>
                                <span style={badgeStyle}>{block.count}</span>
                            </span>
                            <span style={{ fontSize: '11px', color: '#6B7280' }}>
                                {isCollapsed ? '▸' : '▾'}
                            </span>
                        </button>
                        {!isCollapsed && (
                            <div style={{ padding: '10px 8px 8px 8px' }}>
                                {block.body}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

// ============== styles ==============

const sectionStyle: React.CSSProperties = {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    background: '#FFFFFF',
    overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: '#F8FAFC',
    border: 'none',
    borderBottom: '1px solid #E5E7EB',
    cursor: 'pointer',
};

const badgeStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '999px',
    background: '#E0E7FF',
    color: '#3730A3',
    marginLeft: '4px',
};

function chipBtnStyle(accent: boolean): React.CSSProperties {
    return {
        padding: '6px 10px',
        borderRadius: '999px',
        border: accent ? '1px solid #C7D2FE' : '1px solid #D1D5DB',
        background: accent ? '#EEF2FF' : '#FFFFFF',
        color: accent ? '#3730A3' : '#374151',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    };
}

function postActionBtnStyle(variant?: 'default' | 'primary' | 'subtle'): React.CSSProperties {
    const isPrimary = variant === 'primary';
    const isSubtle = variant === 'subtle';
    return {
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: '6px',
        border: isPrimary ? '1px solid #4F46E5' : '1px solid #E5E7EB',
        background: isPrimary ? '#4F46E5' : (isSubtle ? 'transparent' : '#FFFFFF'),
        color: isPrimary ? '#FFFFFF' : '#1F2937',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    };
}

const slashBtnStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'baseline',
};
