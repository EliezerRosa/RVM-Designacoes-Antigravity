import { useState, useEffect, useRef } from 'react';
import { chatHistoryService } from '../services/chatHistoryService';
import { askAgent, isAgentConfigured } from '../services/agentService';
import type { ChatMessage } from '../services/agentService';
import type { Publisher, WorkbookPart } from '../types';

/**
 * TemporalChat - Chat interface with persistent history (14‑day retention)
 * and integration with Gemini via agentService.
 */

interface Props {
    publishers: Publisher[];
    parts: WorkbookPart[];
}

export default function TemporalChat({ publishers, parts }: Props) {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load or create a session on mount
    useEffect(() => {
        async function init() {
            const recent = await chatHistoryService.getRecentSessions(5);
            const existing = recent.find(s => s.title === 'Temporal Chat');
            if (existing) {
                setSessionId(existing.id);
                setMessages(existing.messages);
            } else {
                const newSession = await chatHistoryService.createSession('Temporal Chat');
                setSessionId(newSession.id);
                setMessages([]);
            }
        }
        init();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || !sessionId || isLoading) return;

        const userMsg: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        // Add user message to UI and IndexedDB
        await chatHistoryService.addMessage(sessionId, userMsg);
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Check if agent is configured
            if (!isAgentConfigured()) {
                const errorMsg: ChatMessage = {
                    role: 'assistant',
                    content: '⚠️ API Key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env.local',
                    timestamp: new Date(),
                };
                await chatHistoryService.addMessage(sessionId, errorMsg);
                setMessages(prev => [...prev, errorMsg]);
                return;
            }

            // Call the agent
            const response = await askAgent(
                userMsg.content,
                publishers,
                parts,
                [], // history (empty for now)
                messages, // chatHistory
                'elder', // accessLevel
                [], // specialEvents
                [] // localNeeds
            );

            const agentMsg: ChatMessage = {
                role: 'assistant',
                content: response.success ? response.message : `❌ Erro: ${response.error}`,
                timestamp: new Date(),
            };

            await chatHistoryService.addMessage(sessionId, agentMsg);
            setMessages(prev => [...prev, agentMsg]);
        } catch (error) {
            console.error('[TemporalChat] Error calling agent:', error);
            const errorMsg: ChatMessage = {
                role: 'assistant',
                content: `❌ Erro ao processar mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                timestamp: new Date(),
            };
            await chatHistoryService.addMessage(sessionId, errorMsg);
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px' }}>
                        <p>👋 Olá! Sou o Assistente RVM.</p>
                        <p style={{ fontSize: '12px' }}>Pergunte sobre publicadores, designações ou regras de elegibilidade.</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: msg.role === 'assistant' ? '#4F46E5' : '#111' }}>
                            {msg.role === 'assistant' ? '🤖' : '👤'}:
                        </span>{' '}
                        <span style={{ wordBreak: 'break-word', color: '#111' }}>
                            {msg.content ? msg.content : <em>(sem conteúdo)</em>}
                        </span>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ marginBottom: '8px', color: '#9CA3AF' }}>
                        <span>🤖 Pensando...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px', display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={isLoading}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                />
                <button
                    onClick={sendMessage}
                    disabled={isLoading}
                    style={{
                        background: isLoading ? '#9CA3AF' : '#4F46E5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? '...' : 'Enviar'}
                </button>
            </div>
        </div>
    );
}
