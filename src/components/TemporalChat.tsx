import { useState, useEffect, useRef } from 'react';
import { chatHistoryService } from '../services/chatHistoryService';
import { askAgent, isAgentConfigured } from '../services/agentService';
import type { ChatMessage } from '../services/agentService';
import type { Publisher, WorkbookPart } from '../types';
import { agentActionService } from '../services/agentActionService';
import type { SimulationResult } from '../services/agentActionService';

interface Props {
    publishers: Publisher[];
    parts: WorkbookPart[];
    onAction?: (result: SimulationResult) => void;
    onNavigateToWeek?: (weekId: string) => void;  // NEW: Navigate S-140 when agent mentions a week
}

export default function TemporalChat({ publishers, parts, onAction, onNavigateToWeek }: Props) {
    // ... existing hooks ...
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Rate Limit Countdown State (from API error)
    const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);

    // Local Rate Limit Tracking (15 req/min)
    const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
    const MAX_REQUESTS_PER_MINUTE = 15;

    // Calculate Credits & Refill
    const now = Date.now();
    const recentRequests = requestTimestamps.filter(t => now - t < 60000);
    const creditsRemaining = Math.max(0, MAX_REQUESTS_PER_MINUTE - recentRequests.length);
    const oldestRequest = recentRequests.length > 0 ? recentRequests[0] : null;
    const refillInSeconds = oldestRequest ? Math.ceil((oldestRequest + 60000 - now) / 1000) : 0;

    // Action Handling State
    const [pendingResult, setPendingResult] = useState<SimulationResult | null>(null);

    const handleConfirmAction = async () => {
        if (!pendingResult || !sessionId) return;

        try {
            await agentActionService.commitAction(pendingResult);

            const successMsg: ChatMessage = {
                role: 'assistant',
                content: `✅ Ação efetuada com sucesso! As designações foram atualizadas no banco de dados.`,
                timestamp: new Date(),
            };

            await chatHistoryService.addMessage(sessionId, successMsg);
            setMessages(prev => [...prev, successMsg]);
            setPendingResult(null);

        } catch (error) {
            console.error('Failed to commit action:', error);
            const errorMsg: ChatMessage = {
                role: 'assistant',
                content: `❌ Erro ao salvar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                timestamp: new Date(),
            };
            await chatHistoryService.addMessage(sessionId, errorMsg);
            setMessages(prev => [...prev, errorMsg]);
        }
    };

    const handleCancelAction = () => {
        setPendingResult(null);
    };

    // ... existing useEffects ...
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
    }, [messages, pendingResult]);

    // Timer to update UI for local rate limit (every second)
    useEffect(() => {
        if (requestTimestamps.length === 0) return;

        const timer = setInterval(() => {
            // Force re-render to update 'refillInSeconds'
            setRequestTimestamps(prev => prev.filter(t => Date.now() - t < 60000));
        }, 1000);
        return () => clearInterval(timer);
    }, [requestTimestamps]);

    // Countdown timer for API rate limiting error
    useEffect(() => {
        if (rateLimitCountdown <= 0) return;

        const timer = setInterval(() => {
            setRateLimitCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [rateLimitCountdown]);

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
        setPendingResult(null); // Clear any previous pending action

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

            // Track request Locally
            setRequestTimestamps(prev => [...prev, Date.now()]);

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

            // Base message from agent
            const agentMsg: ChatMessage = {
                role: 'assistant',
                content: response.success ? response.message : `❌ Erro: ${response.error}`,
                timestamp: new Date(),
            };

            await chatHistoryService.addMessage(sessionId, agentMsg);
            setMessages(prev => [...prev, agentMsg]);

            // NEW: Detect week patterns in response and navigate
            if (response.success && onNavigateToWeek) {
                // Pattern: YYYY-MM-DD format
                const weekPattern = /(\d{4}-\d{2}-\d{2})/;
                const match = response.message.match(weekPattern);
                if (match) {
                    console.log('[TemporalChat] Navigating to week:', match[1]);
                    onNavigateToWeek(match[1]);
                }
            }

            // Handle Action if present
            if (response.success && response.action) {
                console.log('[TemporalChat] Executing action:', response.action);
                const result = await agentActionService.simulateAction(response.action, parts, publishers);

                if (result.success) {
                    // Notify parent to update view
                    if (onAction) onAction(result);

                    // Set as pending for confirmation
                    setPendingResult(result);

                    // Add system feedback message
                    const systemMsg: ChatMessage = {
                        role: 'assistant',
                        content: `👁️ Simulação: ${result.message}`,
                        timestamp: new Date(),
                    };
                    await chatHistoryService.addMessage(sessionId, systemMsg);
                    setMessages(prev => [...prev, systemMsg]);
                } else {
                    // Error in simulation
                    const errorMsg: ChatMessage = {
                        role: 'assistant',
                        content: `⚠️ Não foi possível realizar a ação: ${result.message}`,
                        timestamp: new Date(),
                    };
                    await chatHistoryService.addMessage(sessionId, errorMsg);
                    setMessages(prev => [...prev, errorMsg]);
                }
            }

        } catch (error) {
            console.error('[TemporalChat] Error calling agent:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

            // Detect rate limit error and extract wait time
            const rateLimitMatch = errorMessage.match(/Please retry in ([\d.]+)s/);
            if (rateLimitMatch) {
                const waitSeconds = Math.ceil(parseFloat(rateLimitMatch[1]));
                setRateLimitCountdown(waitSeconds);

                // SYNC: If API says we are limited, consume all local credits immediately
                // This prevents "15/15" display when actually blocked server-side
                const now = Date.now();
                // Add enough fake timestamps to drop credits to 0
                const fakeTimestamps = Array(MAX_REQUESTS_PER_MINUTE).fill(now);
                setRequestTimestamps(fakeTimestamps);

                const rateLimitMsg: ChatMessage = {
                    role: 'assistant',
                    content: `⏳ Limite de requisições atingido. Aguarde ${waitSeconds} segundos...`,
                    timestamp: new Date(),
                };
                await chatHistoryService.addMessage(sessionId, rateLimitMsg);
                setMessages(prev => [...prev, rateLimitMsg]);
            } else {
                const errorMsg: ChatMessage = {
                    role: 'assistant',
                    content: `❌ Erro ao processar mensagem: ${errorMessage}`,
                    timestamp: new Date(),
                };
                await chatHistoryService.addMessage(sessionId, errorMsg);
                setMessages(prev => [...prev, errorMsg]);
            }
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
            {pendingResult && pendingResult.success && (
                <div style={{ padding: '12px', background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', borderTop: '2px solid #0EA5E9', boxShadow: '0 -2px 10px rgba(14, 165, 233, 0.15)' }}>
                    <div style={{ fontWeight: 'bold', color: '#0369A1', marginBottom: '4px' }}>
                        Ação Pendente (Simulação)
                    </div>
                    <div style={{ fontSize: '13px', color: '#0C4A6E', marginBottom: '8px' }}>
                        {pendingResult.message}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleConfirmAction}
                            style={{
                                flex: 1,
                                background: '#0EA5E9',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={handleCancelAction}
                            style={{
                                flex: 1,
                                background: 'white',
                                color: '#64748B',
                                border: '1px solid #E2E8F0',
                                borderRadius: '4px',
                                padding: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
            {rateLimitCountdown > 0 && (
                <div style={{
                    padding: '10px 12px',
                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                    borderTop: '2px solid #F59E0B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#F59E0B',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px'
                    }}>
                        {rateLimitCountdown}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#92400E', fontSize: '13px' }}>
                            ⏳ Limite de requisições atingido
                        </div>
                        <div style={{ fontSize: '11px', color: '#B45309' }}>
                            Aguarde {rateLimitCountdown} segundos para enviar nova mensagem
                        </div>
                    </div>
                </div>
            )}
            <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px', display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    placeholder={rateLimitCountdown > 0 ? `Aguarde ${rateLimitCountdown}s...` : "Digite sua mensagem..."}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={isLoading || rateLimitCountdown > 0}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', opacity: rateLimitCountdown > 0 ? 0.6 : 1 }}
                />
                <button
                    onClick={sendMessage}
                    disabled={isLoading || rateLimitCountdown > 0 || creditsRemaining === 0}
                    style={{
                        background: (isLoading || rateLimitCountdown > 0 || creditsRemaining === 0) ? '#9CA3AF' : '#4F46E5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        cursor: (isLoading || rateLimitCountdown > 0 || creditsRemaining === 0) ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? '...' : rateLimitCountdown > 0 ? `${rateLimitCountdown}s` : creditsRemaining === 0 ? 'Aguarde recarga...' : 'Enviar'}
                </button>
            </div>
            <div style={{ padding: '0 8px 4px 8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9CA3AF' }}>
                <span title="Créditos restantes nesta janela de 1 minuto">
                    {rateLimitCountdown > 0
                        ? <span style={{ color: '#EF4444', fontWeight: 'bold' }}>⛔ Bloqueado pela API</span>
                        : `💳 Créditos: ${creditsRemaining}/${MAX_REQUESTS_PER_MINUTE}`
                    }
                </span>
                {refillInSeconds > 0 && (
                    <span title="Tempo para liberar mais uma requisição">
                        ⏳ Recarga em: {rateLimitCountdown > 0 ? rateLimitCountdown : refillInSeconds}s
                    </span>
                )}
            </div>
        </div>
    );
}
