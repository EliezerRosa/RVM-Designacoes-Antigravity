import { useState, useEffect, useRef } from 'react';
import { chatHistoryService } from '../services/chatHistoryService';
import type { ChatMessage } from '../services/agentService';

/**
 * TemporalChat - Simple chat interface with persistent history (14‑day retention).
 * Uses the existing `chatHistoryService` to store messages locally in IndexedDB.
 * For now the component creates a single session titled "Temporal Chat" and
 * displays its messages. Future enhancements may tie the session to the current
 * week ID or agent context.
 */
export default function TemporalChat() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load or create a session on mount
    useEffect(() => {
        async function init() {
            // Try to find an existing session named "Temporal Chat"
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

    // Keep messages up‑to‑date when the session changes
    useEffect(() => {
        if (!sessionId) return;
        const interval = setInterval(async () => {
            const sess = await chatHistoryService.getSession(sessionId);
            if (sess) setMessages(sess.messages);
        }, 2000); // poll every 2 s – simple approach for now
        return () => clearInterval(interval);
    }, [sessionId]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || !sessionId) return;
        const newMsg: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };
        await chatHistoryService.addMessage(sessionId, newMsg);
        setInput('');
        // Optimistically add to UI (will be refreshed by poll)
        setMessages(prev => [...prev, newMsg]);
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
                {messages.map((msg, idx) => (
                    <div key={idx} style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: msg.role === 'assistant' ? '#4F46E5' : '#111' }}>
                            {msg.role === 'assistant' ? '🤖' : '👤'}:
                        </span>{' '}
                        <span style={{ wordBreak: 'break-word' }}>
                            {msg.content ? msg.content : <em>(sem conteúdo)</em>}
                        </span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px', display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                />
                <button
                    onClick={sendMessage}
                    style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px' }}
                >
                    Enviar
                </button>
            </div>
        </div>
    );
}
