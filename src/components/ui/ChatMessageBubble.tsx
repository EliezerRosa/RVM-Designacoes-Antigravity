/**
 * ChatMessageBubble.tsx
 * 
 * Componente unificado para exibição de mensagens de chat.
 * Traz a estética "Ferrari" (Gradient, Rounded) para todas as interfaces.
 * Suporta Timestamp e Continuation.
 */



export interface ChatMessageBubbleProps {
    role: 'user' | 'assistant' | 'system' | 'model'; // 'model' alias for assistant
    content: string;
    timestamp?: Date;
    onShowMore?: () => void;
}

export function ChatMessageBubble({ role, content, timestamp, onShowMore }: ChatMessageBubbleProps) {
    const isUser = role === 'user';
    const isSystem = role === 'system';

    // Se for mensagem de sistema, renderiza diferente (discreto)
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

    // Detecção de continuação
    const hasContinuation = !isUser && content.includes('[CONTINUA...]');
    const displayContent = hasContinuation
        ? content.replace('[CONTINUA...]', '').trim()
        : content;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isUser ? 'flex-end' : 'flex-start',
            gap: '4px',
            maxWidth: '85%',
            alignSelf: isUser ? 'flex-end' : 'flex-start'
        }}>
            <div
                style={{
                    padding: '12px 16px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser
                        ? 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)'
                        : 'white',
                    color: isUser ? 'white' : '#1F2937',
                    boxShadow: isUser
                        ? '0 4px 12px rgba(99, 102, 241, 0.25)' // Sombra colorida no user
                        : '0 2px 8px rgba(0,0,0,0.08)', // Sombra suave no bot
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.6', // Mais arejado
                    position: 'relative', // Para posicionamento absoluto se necessário
                    border: isUser ? 'none' : '1px solid rgba(0,0,0,0.03)'
                }}
            >
                {/* Renderizar markdown simples (Bold) */}
                {displayContent.split('**').map((part, i) =>
                    i % 2 === 1
                        ? <strong key={i}>{part}</strong>
                        : part
                )}
            </div>

            {/* Timestamp e Status Area */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 4px',
                opacity: 0.8
            }}>
                {timestamp && (
                    <span style={{
                        fontSize: '10px',
                        color: '#9CA3AF',
                        fontFamily: 'monospace',
                        pointerEvents: 'none'
                    }}>
                        {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  {/* Ex: 14:30 */}
                        {/* Se quisermos data completa no hover: title={timestamp.toLocaleString()} */}
                    </span>
                )}

                {/* Botão Ver Mais (Ferrari Style) */}
                {hasContinuation && onShowMore && (
                    <button
                        onClick={onShowMore}
                        style={{
                            padding: '4px 8px',
                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: '600',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginLeft: '4px'
                        }}
                    >
                        Ver mais ⬇
                    </button>
                )}
            </div>
        </div>
    );
}
