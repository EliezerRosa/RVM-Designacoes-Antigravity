/**
 * ChatAgent - Modal de Chat com o Agente IA
 * 
 * Interface de chat para interação com o assistente especialista
 */

import { useState, useRef, useEffect } from 'react';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import {
    askAgent,
    isAgentConfigured,
    getSuggestedQuestions,
    type ChatMessage,
} from '../services/agentService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    publishers: Publisher[];
    parts: WorkbookPart[];
    history?: HistoryRecord[];
}

// ===== Estilos =====

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
};

const modalStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '600px',
    height: '80vh',
    maxHeight: '700px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    padding: '16px 20px',
    background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

const messagesContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: '#F9FAFB',
};

const inputContainerStyle: React.CSSProperties = {
    padding: '16px',
    borderTop: '1px solid #E5E7EB',
    background: 'white',
    display: 'flex',
    gap: '8px',
};

// ===== Componente =====

export function ChatAgent({ isOpen, onClose, publishers, parts, history = [] }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll para última mensagem
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Mensagem de boas-vindas
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const configured = isAgentConfigured();
            setMessages([{
                role: 'assistant',
                content: configured
                    ? 'Olá! Sou o **Assistente RVM** 🤖\n\nPosso responder perguntas sobre publicadores, regras de elegibilidade, estatísticas e muito mais.\n\nComo posso ajudar?'
                    : '⚠️ **API Key não configurada**\n\nPara usar o assistente, configure `VITE_GEMINI_API_KEY` no arquivo `.env.local` e reinicie o app.',
                timestamp: new Date(),
            }]);
        }
    }, [isOpen, messages.length]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setShowSuggestions(false);

        const response = await askAgent(
            userMessage.content,
            publishers,
            parts,
            history,
            messages
        );

        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.success
                ? response.message
                : `❌ **Erro:** ${response.error}`,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);
        setLoading(false);
    };

    const handleSuggestionClick = (question: string) => {
        setInput(question);
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const renderMessage = (msg: ChatMessage, idx: number) => {
        const isUser = msg.role === 'user';

        return (
            <div
                key={idx}
                style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser
                        ? 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)'
                        : 'white',
                    color: isUser ? 'white' : '#1F2937',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.5',
                }}
            >
                {/* Renderizar markdown simples */}
                {msg.content.split('**').map((part, i) =>
                    i % 2 === 1
                        ? <strong key={i}>{part}</strong>
                        : part
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>🤖</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                                Assistente RVM
                            </h3>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>
                                {publishers.length} publicadores • {parts.length} partes
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Messages */}
                <div style={messagesContainerStyle}>
                    {messages.map((msg, idx) => renderMessage(msg, idx))}

                    {/* Loading indicator */}
                    {loading && (
                        <div style={{
                            alignSelf: 'flex-start',
                            padding: '12px 16px',
                            background: 'white',
                            borderRadius: '16px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            display: 'flex',
                            gap: '4px',
                        }}>
                            <span className="typing-dot" style={{ animationDelay: '0s' }}>●</span>
                            <span className="typing-dot" style={{ animationDelay: '0.2s' }}>●</span>
                            <span className="typing-dot" style={{ animationDelay: '0.4s' }}>●</span>
                        </div>
                    )}

                    {/* Suggestions */}
                    {showSuggestions && messages.length === 1 && isAgentConfigured() && (
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
                                💡 Perguntas sugeridas:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {getSuggestedQuestions().slice(0, 4).map((q, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSuggestionClick(q)}
                                        style={{
                                            padding: '8px 12px',
                                            background: 'white',
                                            border: '1px solid #E5E7EB',
                                            borderRadius: '20px',
                                            fontSize: '12px',
                                            color: '#4B5563',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.borderColor = '#8B5CF6';
                                            e.currentTarget.style.color = '#8B5CF6';
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.borderColor = '#E5E7EB';
                                            e.currentTarget.style.color = '#4B5563';
                                        }}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={inputContainerStyle}>
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Faça uma pergunta..."
                        disabled={loading || !isAgentConfigured()}
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            border: '1px solid #E5E7EB',
                            borderRadius: '24px',
                            fontSize: '14px',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.target.style.borderColor = '#8B5CF6'}
                        onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim() || !isAgentConfigured()}
                        style={{
                            padding: '12px 20px',
                            background: loading || !input.trim()
                                ? '#D1D5DB'
                                : 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '24px',
                            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s',
                        }}
                    >
                        {loading ? '...' : 'Enviar'}
                    </button>
                </div>
            </div>

            {/* Typing animation CSS */}
            <style>{`
                @keyframes typing {
                    0%, 60%, 100% { opacity: 0.3; }
                    30% { opacity: 1; }
                }
                .typing-dot {
                    font-size: 14px;
                    color: #8B5CF6;
                    animation: typing 1.2s infinite;
                }
            `}</style>
        </div>
    );
}
