/**
 * RightPanelDetails — Conteúdo do drawer DIR (Coluna 2 do PowerfulAgentTab).
 *
 * Filosofia IDD:
 *  - Hospeda micro-UIs ativas (aprovação, disponibilidade, ficha rápida,
 *    conclusão de partes) que antes apareciam como cards flutuantes
 *    sobrepostos à conversa.
 *  - Mostra a micro-UI marcada como ativa em foco; demais ficam em accordion
 *    colapsável dentro do mesmo painel (1 painel por vez na regra do Shell).
 *  - Fora do escopo deste painel: respostas longas/relatórios — vão para
 *    modal à parte (ver `AgentModalHost`).
 */

import React, { useState, useEffect } from 'react';
import type { FloatingMicroUiItem } from './FloatingMicroUiHost';
void React;

interface RightPanelDetailsProps {
    items: FloatingMicroUiItem[];
    activeId: string | null;
}

export function RightPanelDetails({ items, activeId }: RightPanelDetailsProps) {
    const [expandedId, setExpandedId] = useState<string | null>(activeId ?? items[0]?.id ?? null);

    // Sempre que activeId mudar (request de abertura externa), expande aquele
    // bloco — mantendo a regra de que a chegada de uma micro-UI "puxa o foco".
    // Deps deliberadamente reduzidas a [activeId]: itens chegam/saem sem
    // sobrescrever escolha manual do usuário; só um novo activeId força foco.
    useEffect(() => {
        if (activeId) setExpandedId(activeId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]);

    if (items.length === 0) {
        return (
            <div style={{ fontSize: '12px', opacity: 0.7, padding: '8px 4px', lineHeight: 1.5 }}>
                Nenhuma micro-UI ativa no momento. Edições rápidas (publicador,
                disponibilidade, conclusão de parte, aprovação de propostas)
                aparecem aqui quando o agente as oferece ou você as solicita.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => {
                const isOpen = expandedId === item.id;
                return (
                    <section
                        key={item.id}
                        aria-label={item.title}
                        style={{
                            border: `1px solid ${isOpen ? item.accent : '#E5E7EB'}`,
                            borderRadius: 10,
                            background: '#FFFFFF',
                            overflow: 'hidden',
                            boxShadow: isOpen ? `0 0 0 2px ${item.accent}22` : 'none',
                            transition: 'box-shadow 0.15s, border-color 0.15s',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setExpandedId(isOpen ? null : item.id)}
                            aria-expanded={isOpen}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                background: isOpen ? `${item.accent}10` : '#F9FAFB',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#111827',
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: item.accent, flexShrink: 0,
                                }}
                            />
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block' }}>{item.title}</span>
                                {item.subtitle && (
                                    <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#6B7280', marginTop: 2 }}>
                                        {item.subtitle}
                                    </span>
                                )}
                            </span>
                            {item.badge && (
                                <span
                                    style={{
                                        fontSize: 10, padding: '2px 8px', borderRadius: 999,
                                        background: `${item.accent}22`, color: item.accent, fontWeight: 600,
                                        flexShrink: 0,
                                    }}
                                >
                                    {item.badge}
                                </span>
                            )}
                            <span aria-hidden="true" style={{ fontSize: 12, color: '#6B7280' }}>
                                {isOpen ? '▾' : '▸'}
                            </span>
                        </button>
                        {isOpen && (
                            <div style={{ padding: '12px', borderTop: '1px solid #F3F4F6' }}>
                                {item.content}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
