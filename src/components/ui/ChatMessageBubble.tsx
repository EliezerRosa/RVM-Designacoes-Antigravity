/**
 * ChatMessageBubble.tsx
 * 
 * Componente unificado para exibição de mensagens de chat.
 * Suporta markdown: **bold**, *italic*, tabelas, listas, quebras de linha.
 */

import React, { useState } from 'react';

export interface ChatMessageBubbleProps {
    role: 'user' | 'assistant' | 'system' | 'model'; // 'model' alias for assistant
    content: string;
    timestamp?: Date;
    onShowMore?: () => void;
}

/** Limiar IDD: respostas longas saem da bolha e abrem modal à parte. */
const LONG_RESPONSE_CHARS = 1500;
const LONG_RESPONSE_MARKER = '\n\n## ';

function isLongResponse(text: string): boolean {
    return text.length > LONG_RESPONSE_CHARS || text.includes(LONG_RESPONSE_MARKER);
}

/** Resumo curto da bolha para respostas longas: até a 1ª quebra dupla
 *  ou primeiros ~400 caracteres, o que vier antes. */
function summarizeLong(text: string): string {
    const idx = text.indexOf('\n\n');
    const cap = 400;
    let summary = idx > 0 && idx < cap ? text.slice(0, idx) : text.slice(0, cap);
    if (summary.length < text.length) summary += '…';
    return summary;
}

/** Renderiza markdown básico como JSX */
function renderMarkdown(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Detecta linha de tabela: começa com |
        if (line.trim().startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            // Filtra linha separadora (|---|---|)
            const rows = tableLines.filter(l => !/^\s*\|[-\s|:]+\|\s*$/.test(l));
            result.push(
                <table key={`table-${i}`} style={{
                    borderCollapse: 'collapse', width: '100%', fontSize: '13px',
                    margin: '8px 0', borderRadius: '8px', overflow: 'hidden'
                }}>
                    {rows.map((row, ri) => {
                        const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
                        const Tag = ri === 0 ? 'th' : 'td';
                        return (
                            <tr key={ri} style={{ background: ri % 2 === 0 ? '#F9FAFB' : 'white' }}>
                                {cells.map((cell, ci) => (
                                    <Tag key={ci} style={{
                                        padding: '6px 10px',
                                        border: '1px solid #E5E7EB',
                                        textAlign: 'left',
                                        fontWeight: ri === 0 ? 700 : 400,
                                        background: ri === 0 ? '#F3F4F6' : undefined
                                    }}>
                                        {applyInline(cell.trim())}
                                    </Tag>
                                ))}
                            </tr>
                        );
                    })}
                </table>
            );
            continue;
        }

        // Lista com bullet
        if (line.trim().match(/^[-*•]\s/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i].trim().match(/^[-*•]\s/)) {
                items.push(lines[i].trim().replace(/^[-*•]\s/, ''));
                i++;
            }
            result.push(
                <ul key={`ul-${i}`} style={{ paddingLeft: '18px', margin: '4px 0' }}>
                    {items.map((item, ii) => <li key={ii}>{applyInline(item)}</li>)}
                </ul>
            );
            continue;
        }

        // Linha vazia
        if (line.trim() === '') {
            result.push(<br key={`br-${i}`} />);
            i++;
            continue;
        }

        // Linha normal
        result.push(<span key={`line-${i}`}>{applyInline(line)}<br /></span>);
        i++;
    }

    return result;
}

/** Aplica formatação inline: **bold**, *italic* */
function applyInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
    });
}

export function ChatMessageBubble({ role, content, timestamp, onShowMore }: ChatMessageBubbleProps) {
    const isUser = role === 'user';
    const isSystem = role === 'system';

    if (isSystem) {
        return (
            <div style={{
                alignSelf: 'center',
                background: 'rgba(0,0,0,0.05)',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#6B7280',
                margin: '8px 0'
            }}>
                {content}
            </div>
        );
    }

    const hasContinuation = !isUser && content.includes('[CONTINUA...]');
    const displayContent = hasContinuation ? content.replace('[CONTINUA...]', '').trim() : content;

    // IDD: resposta longa do agente vai para modal à parte; bolha mostra só o resumo.
    const longMode = !isUser && isLongResponse(displayContent);
    const [showFullModal, setShowFullModal] = useState(false);
    const bubbleContent = longMode ? summarizeLong(displayContent) : displayContent;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isUser ? 'flex-end' : 'flex-start',
            gap: '4px',
            maxWidth: '85%',
            alignSelf: isUser ? 'flex-end' : 'flex-start'
        }}>
            <div style={{
                padding: '12px 16px',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isUser ? 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)' : 'white',
                color: isUser ? 'white' : '#1F2937',
                boxShadow: isUser ? '0 4px 12px rgba(99, 102, 241, 0.25)' : '0 2px 8px rgba(0,0,0,0.08)',
                wordBreak: 'break-word',
                fontSize: '14px',
                lineHeight: '1.6',
                position: 'relative',
                border: isUser ? 'none' : '1px solid rgba(0,0,0,0.03)'
            }}>
                {isUser
                    ? bubbleContent
                    : renderMarkdown(bubbleContent)
                }
                {longMode && (
                    <button
                        type="button"
                        onClick={() => setShowFullModal(true)}
                        style={{
                            marginTop: 10,
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px',
                            background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
                            color: 'white', border: 'none', borderRadius: 999, cursor: 'pointer',
                            fontSize: 12, fontWeight: 600,
                            boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                        }}
                        aria-label="Abrir resposta completa em modal"
                    >
                        📄 Abrir resposta completa
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px', opacity: 0.8 }}>
                {timestamp && (
                    <span style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace', pointerEvents: 'none' }}>
                        {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
                {hasContinuation && onShowMore && (
                    <button onClick={onShowMore} style={{
                        padding: '4px 8px',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer',
                        fontSize: '10px', fontWeight: '600', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                        display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px'
                    }}>
                        Ver mais ⬇
                    </button>
                )}
            </div>

            {/* IDD: modal overlay para resposta longa. Centralizado, com Esc/click-out e markdown completo. */}
            {longMode && showFullModal && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Resposta completa do agente"
                    onClick={() => setShowFullModal(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowFullModal(false); }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9998,
                        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white', color: '#111827',
                            borderRadius: 14, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
                            width: 'min(880px, 100%)', maxHeight: '85vh',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB',
                        }}>
                            <strong style={{ fontSize: 14 }}>📄 Resposta completa do agente</strong>
                            <button
                                type="button"
                                onClick={() => setShowFullModal(false)}
                                aria-label="Fechar resposta completa"
                                style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    fontSize: 22, lineHeight: 1, color: '#6B7280',
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{
                            padding: '16px 20px', overflowY: 'auto', fontSize: 14, lineHeight: 1.65,
                        }}>
                            {renderMarkdown(displayContent)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

