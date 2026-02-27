import { useState, useEffect, useRef } from 'react';
import { ChatMessageBubble } from './ui/ChatMessageBubble';
import { chatHistoryService } from '../services/chatHistoryService';
import { askAgent, isAgentConfigured } from '../services/agentService';
import type { ChatMessage } from '../services/agentService';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { agentActionService } from '../services/agentActionService';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import type { ActionResult } from '../services/agentActionService';
import html2canvas from 'html2canvas';
import { prepareS140UnifiedData, renderS140ToElement } from '../services/s140GeneratorUnified';

import { specialEventService } from '../services/specialEventService';
// import { localNeedsService } from '../services/localNeedsService';
import type { SpecialEventInput, LocalNeedsInput } from '../services/contextBuilder';

interface TemporalChatProps {
    publishers: Publisher[];
    parts: WorkbookPart[];
    onAction?: (result: ActionResult) => void;
    onNavigateToWeek?: (weekId: string) => void;
    onModelChange?: (model: string) => void;
    currentWeekId?: string;
    focusWeekId?: string;
    historyRecords?: HistoryRecord[];
    initialCommand?: string;
    isWorkbookLoading?: boolean;
}

export default function TemporalChat({
    publishers,
    parts,
    onAction,
    onNavigateToWeek,
    onModelChange,
    currentWeekId,
    focusWeekId,
    historyRecords = [],
    initialCommand,
    isWorkbookLoading = false
}: TemporalChatProps) {
    // ... existing hooks ...
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Share S-140 State
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareImageData, setShareImageData] = useState<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [shareWeekId, setShareWeekId] = useState<string>('');
    const [isViewMode, setIsViewMode] = useState(false); // NEW: Distinguish View vs Share

    // Rate Limit Countdown State (from API error)
    const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);

    // Local Rate Limit Tracking (15 req/min)
    const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
    const MAX_REQUESTS_PER_MINUTE = 15;

    // Context Data State
    const [specialEventsCtx, setSpecialEventsCtx] = useState<SpecialEventInput[]>([]);
    const [localNeedsCtx] = useState<LocalNeedsInput[]>([]);

    // Calculate Credits & Refill
    const now = Date.now();
    const recentRequests = requestTimestamps.filter(t => now - t < 60000);
    const creditsRemaining = Math.max(0, MAX_REQUESTS_PER_MINUTE - recentRequests.length);
    const oldestRequest = recentRequests.length > 0 ? recentRequests[0] : null;
    const refillInSeconds = oldestRequest ? Math.ceil((oldestRequest + 60000 - now) / 1000) : 0;

    // Action Handling State
    // Action Handling State (No longer used for pendingResult, actions are immediate)


    // v9.3: Batch removed - Agent uses existing Workbook UI



    // v9.3: Batch handlers removed - Agent delegates to generationService

    // Handle Share S-140 Action
    const handleShareS140 = async (weekId: string, viewOnly: boolean = false) => {
        try {
            setIsGeneratingImage(true);
            setShareWeekId(weekId);
            setIsViewMode(viewOnly);
            setShareModalOpen(true);
            setShareImageData(null);

            // Filter parts for the week
            console.log(`[TemporalChat] Gerando preview para ${weekId}. Total partes no contexto: ${parts.length}`);
            const weekParts = parts.filter(p => p.weekId === weekId);

            if (weekParts.length === 0) {
                console.warn(`[TemporalChat] Nenhuma parte encontrada para a semana ${weekId}`);
                alert('Nenhuma designação encontrada para esta semana no contexto atual. Use "atualizar dados" se as designações forem recentes.');
                setShareModalOpen(false);
                return;
            }

            // Prepare Data and HTML
            const weekData = await prepareS140UnifiedData(weekParts, publishers);
            const element = renderS140ToElement(weekData);

            // Append to body effectively invisible but rendered
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '0';
            document.body.appendChild(element);

            // Capture
            const canvas = await html2canvas(element.querySelector('.container') as HTMLElement, {
                scale: 2, // High resolution
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            // Cleanup
            document.body.removeChild(element);

            // Set Data
            setShareImageData(canvas.toDataURL('image/png'));

        } catch (err) {
            console.error('Error generating S-140 image:', err);
            alert('Erro ao gerar imagem para compartilhamento.');
            setShareModalOpen(false);
        } finally {
            setIsGeneratingImage(false);
        }
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

    // Load Context Data on Mount
    useEffect(() => {
        async function loadContextData() {
            try {
                // 1. Special Events
                const events = await specialEventService.getAllEvents();
                const processedEvents: SpecialEventInput[] = events.map(e => ({
                    week: e.week,
                    templateId: e.templateId,
                    templateName: e.templateId, // Template name might need lookup, using ID for now
                    theme: e.theme,
                    responsible: e.responsible,
                    isApplied: e.isApplied,
                    observations: e.observations,
                    guidelines: e.guidelines,
                    configuration: e.configuration
                }));
                setSpecialEventsCtx(processedEvents);

                // 2. Local Needs (Assuming we can fetch pending ones)
                // Note: localNeedsService might not have a simple 'getAll' exposed for chat context yet
                // For now, we fetch from queue if available, or just keep empty if not easy to access
                // Trying a direct supabase fetch as fallback if service doesn't have it
                // ... (Skipping complex local needs fetch for this iteration to avoid breaking build, focusing on Special Events)

            } catch (err) {
                console.error('Error loading chat context data:', err);
            }
        }
        loadContextData();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    const sendMessage = async (overrideInput?: string) => {
        // Safety check: Ensure overrideInput is a string and not a PointerEvent or other object
        const finalOverride = typeof overrideInput === 'string' ? overrideInput : undefined;
        const textToSend = finalOverride || input.trim();
        if (!textToSend || !sessionId || isLoading) return;

        const userMsg: ChatMessage = {
            role: 'user',
            content: textToSend,
            timestamp: new Date(),
        };

        // Add user message to UI and IndexedDB
        await chatHistoryService.addMessage(sessionId, userMsg);
        setMessages(prev => [...prev, userMsg]);
        if (!overrideInput) setInput('');
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

            // Track request Locally
            setRequestTimestamps(prev => [...prev, Date.now()]);

            // Call the agent
            const response = await askAgent(
                userMsg.content,
                publishers,
                parts,
                historyRecords, // Passar histórico completo injetado
                messages, // chatHistory
                'elder', // accessLevel
                specialEventsCtx, // specialEvents
                localNeedsCtx, // localNeeds
                currentWeekId // FOCUS WEEK ID provided by Parent (WorkbookManager)
            );

            // Base message from agent
            const agentMsg: ChatMessage = {
                role: 'assistant',
                content: response.success ? response.message : `❌ Erro: ${response.error}`,
                timestamp: new Date(),
            };

            await chatHistoryService.addMessage(sessionId, agentMsg);
            setMessages(prev => [...prev, agentMsg]);

            if (response.isFallback) {
                console.warn('[TemporalChat] Smart Fallback activated (System alert suppressed in UI)');
            }

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

            // Notify parent about model used
            if (response.success && response.modelUsed && onModelChange) {
                onModelChange(response.modelUsed);
            }

            // Handle Action if present
            if (response.success && response.action) {
                console.log('[TemporalChat] Executing action:', response.action);

                // v9.3: SIMULATE_BATCH removed - Agent delegates to generationService

                // SPECIAL HANDLER FOR S-140 (VIEW or SHARE)
                if (response.action.type === 'SHARE_S140_WHATSAPP' || response.action.type === 'VIEW_S140') {
                    // Start generation flow immediately
                    const weekId = response.action.params.weekId;
                    const isViewOnly = response.action.type === 'VIEW_S140';

                    if (weekId) {
                        handleShareS140(weekId, isViewOnly);
                    }

                    // Add system message about it
                    const actionLabel = isViewOnly ? 'Visualizando' : 'Abrindo painel de compartilhamento';
                    const systemMsg: ChatMessage = {
                        role: 'assistant',
                        content: `[S-140] ${actionLabel} para semana ${weekId}...`,
                        timestamp: new Date(),
                    };
                    await chatHistoryService.addMessage(sessionId, systemMsg);
                    setMessages(prev => [...prev, systemMsg]);
                    return; // Don't process via executeAction normally
                }

                // EXECUTE ACTION DIRECTLY
                // Convert parts to history for deep analysis
                const history = parts.map(p => workbookPartToHistoryRecord(p));
                const result = await agentActionService.executeAction(response.action, parts, publishers, history, currentWeekId);

                if (result.success) {
                    // Notify parent to update view
                    if (onAction) onAction(result);

                    // Add system feedback message
                    const systemMsg: ChatMessage = {
                        role: 'assistant',
                        content: result.actionType === 'CHECK_SCORE'
                            ? result.message // Use the formatted report directly 
                            : `✅ ${result.message}`,
                        timestamp: new Date(),
                    };
                    await chatHistoryService.addMessage(sessionId, systemMsg);
                    setMessages(prev => [...prev, systemMsg]);

                    // Auto-navigate if applicable
                    if (result.actionType === 'GENERATE_WEEK' && result.data?.generatedWeeks?.[0] && onNavigateToWeek) {
                        onNavigateToWeek(result.data.generatedWeeks[0]);
                    }
                    if (result.actionType === 'NAVIGATE_WEEK' && result.data?.weekId && onNavigateToWeek) {
                        onNavigateToWeek(result.data.weekId);
                    }
                    // For CHECK_SCORE, we might want to optionally navigate to the reference date if provided, but typically it's just info.

                } else {
                    // Error in execution
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
            // Detect rate limit error and extract wait time (Find MAX wait time if multiple)
            const rateLimitMatches = [...errorMessage.matchAll(/Please retry in ([\d.]+)s/g)];
            if (rateLimitMatches.length > 0) {
                // Encontrar o maior tempo de espera sugerido entre todos os erros
                const waitTimes = rateLimitMatches.map(m => parseFloat(m[1]));
                const maxWait = Math.max(...waitTimes);
                const waitSeconds = Math.ceil(maxWait);
                setRateLimitCountdown(waitSeconds);

                // SYNC: If API says we are limited, consume all local credits immediately
                const now = Date.now();
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
            // Auto-focus input after response
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    };

    // Auto-trigger initial command
    useEffect(() => {
        if (initialCommand && sessionId && messages.length > 0 && !isLoading) {
            // Only trigger if the last message isn't already the command or from assistant answering it
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'assistant' && messages.length === 1) {
                // This is the "Naveguei para a semana" message
                sendMessage(initialCommand);
            } else if (messages.length === 0) {
                sendMessage(initialCommand);
            }
        }
    }, [initialCommand, sessionId, messages.length === 0]);

    // Handle initial command on session load
    useEffect(() => {
        const canSend = !isLoading && !isWorkbookLoading && parts.length > 0;

        if (initialCommand && sessionId && messages.length === 0 && canSend) {
            console.log('[TemporalChat] Auto-triggering initial command after data load:', initialCommand);
            sendMessage(initialCommand);
        }
    }, [sessionId, initialCommand, isLoading, isWorkbookLoading, parts.length]);

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
                    <ChatMessageBubble
                        key={idx}
                        role={msg.role === 'assistant' ? 'assistant' : 'user'}
                        content={msg.content || '(sem conteúdo)'}
                        timestamp={msg.timestamp ? new Date(msg.timestamp) : undefined}
                        onShowMore={() => {
                            setInput('continue');
                            setTimeout(() => sendMessage(), 100);
                        }}
                    />
                ))}
                {isLoading && (
                    <div style={{ marginBottom: '8px', color: '#9CA3AF' }}>
                        <span>🤖 Pensando...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {/* Pending actions panel removed - Actions are now direct or conversational */}

            {/* v9.3: BatchSimulationPanel removed - Agent uses existing Workbook UI */}

            {/* Share S-140 Modal */}
            {shareModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px', // Safe margin from edges
                        boxSizing: 'border-box'
                    }}
                    onClick={() => setShareModalOpen(false)} // Close on overlay click
                >
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '12px',
                            maxWidth: '500px',
                            width: '100%',
                            maxHeight: 'calc(100vh - 40px)', // Leave room for safe area
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        onClick={e => e.stopPropagation()} // Prevent closing when clicking content
                    >
                        {/* Fixed Header with Back and Close buttons */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid #E5E7EB',
                            background: '#F9FAFB',
                            flexShrink: 0
                        }}>
                            <button
                                onClick={() => setShareModalOpen(false)}
                                style={{
                                    background: '#E5E7EB',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: '#374151',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                ← Voltar
                            </button>
                            <h3 style={{ margin: 0, color: '#065F46', fontSize: '16px', flex: 1, textAlign: 'center' }}>
                                {isViewMode ? '[S-140]' : '[COMPARTILHAR]'}
                            </h3>
                            <button
                                onClick={() => setShareModalOpen(false)}
                                style={{
                                    background: '#FEE2E2',
                                    border: 'none',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    color: '#DC2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div style={{
                            padding: '20px',
                            overflowY: 'auto',
                            flex: 1
                        }}>
                            {isGeneratingImage ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>🔄</div>
                                    <div style={{ color: '#6B7280' }}>Gerando imagem...</div>
                                </div>
                            ) : shareImageData ? (
                                <div>
                                    <img src={shareImageData} alt="S-140 Preview" style={{ width: '100%', borderRadius: '8px', border: '1px solid #eee', marginBottom: '15px' }} />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const blob = await (await fetch(shareImageData)).blob();
                                                    await navigator.clipboard.write([
                                                        new ClipboardItem({ 'image/png': blob })
                                                    ]);
                                                    alert('Imagem copiada! Agora cole no WhatsApp.');
                                                } catch (e) {
                                                    alert('Erro ao copiar imagem. Tente baixar ou tirar print.');
                                                }
                                            }}
                                            style={{ padding: '14px', background: '#F3F4F6', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                        >
                                            📋 Copiar Imagem
                                        </button>
                                        <a
                                            href={`https://wa.me/?text=Segue%20designações%20da%20semana%20${shareWeekId}%20(Cole%20a%20imagem)`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', background: '#25D366', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px' }}
                                        >
                                            💬 Abrir WhatsApp
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: '#DC2626', textAlign: 'center', padding: '40px 20px', background: '#FEF2F2', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
                                    <div>Erro ao criar imagem. Tente novamente.</div>
                                </div>
                            )}
                        </div>

                        {/* Fixed Footer with prominent Back button */}
                        <div style={{
                            padding: '16px 20px',
                            borderTop: '1px solid #E5E7EB',
                            background: '#F9FAFB',
                            flexShrink: 0
                        }}>
                            <button
                                onClick={() => setShareModalOpen(false)}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    border: '2px solid #4F46E5',
                                    borderRadius: '8px',
                                    background: 'white',
                                    color: '#4F46E5',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '15px'
                                }}
                            >
                                ← Voltar ao Chat
                            </button>
                        </div>
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
                    ref={inputRef}
                    type="text"
                    placeholder={rateLimitCountdown > 0 ? `Aguarde ${rateLimitCountdown}s...` : "Digite sua mensagem..."}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={isLoading || rateLimitCountdown > 0}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #D1D5DB', opacity: rateLimitCountdown > 0 ? 0.6 : 1 }}
                />
                <button
                    onClick={() => sendMessage()}
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
