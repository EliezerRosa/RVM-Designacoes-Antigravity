import { useState, useEffect, useRef, useMemo } from 'react';
import { ChatMessageBubble } from './ui/ChatMessageBubble';
import { ChatActionChips } from './ui/ChatActionChips';
import { IntentContextBar } from './ui/IntentContextBar';
import { PostResponseActions } from './ui/PostResponseActions';
import { SlashCommandMenu } from './ui/SlashCommandMenu';
import { ProposalApprovalMicroUi } from './ui/ProposalApprovalMicroUi';
import { AvailabilityUpdateMicroUi } from './ui/AvailabilityUpdateMicroUi';
import { PublisherQuickEditMicroUi } from './ui/PublisherQuickEditMicroUi';
import { PartCompletionMicroUi } from './ui/PartCompletionMicroUi';
import { FloatingMicroUiHost } from './ui/FloatingMicroUiHost';
import { FloatingPanelShell } from './ui/FloatingPanelShell';
import { chatHistoryService } from '../services/chatHistoryService';
import { askAgent, isAgentConfigured, getSuggestedQuestions } from '../services/agentService';
import type { ChatMessage } from '../services/agentService';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { agentActionService, type AgentAction, type AgentActionType } from '../services/agentActionService';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import type { ActionResult } from '../services/agentActionService';
import html2canvas from 'html2canvas';
import { prepareS140UnifiedData, renderS140ToElement } from '../services/s140GeneratorUnified';

import { specialEventService } from '../services/specialEventService';
import { localNeedsService } from '../services/localNeedsService';
import type { SpecialEventInput, LocalNeedsInput } from '../services/contextBuilder';
import { supabase } from '../lib/supabase';
import { createPermissionGate, getPermissions } from '../services/permissionService';
import { useAuth } from '../context/AuthContext';
import { publisherMutationService } from '../services/publisherMutationService';
import { useTemporalChatSemanticContext } from '../hooks/useTemporalChatSemanticContext';
import { useTemporalChatSemanticControls } from '../hooks/useTemporalChatSemanticControls';

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
    onRateLimitChange?: (remaining: number, max: number, refillInSeconds: number) => void;
    accessLevel?: 'elder' | 'publisher';
    canSendZap?: boolean;
}

export default function TemporalChat({
    publishers,
    parts,
    onAction,
    onNavigateToWeek,
    onModelChange,
    currentWeekId,
    historyRecords = [],
    initialCommand,
    isWorkbookLoading = false,
    onRateLimitChange,
    accessLevel = 'publisher',
    canSendZap = false
}: TemporalChatProps) {
    const { profile } = useAuth();
    // ... existing hooks ...
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastCommandRef = useRef<string | null>(null);

    // Share S-140 State
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareImageData, setShareImageData] = useState<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [shareWeekId, setShareWeekId] = useState<string>('');
    const [isViewMode, setIsViewMode] = useState(false); // NEW: Distinguish View vs Share

    // Rate Limit Countdown State (from API error)
    const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);

    // Voice Chat State
    const [isListening, setIsListening] = useState(false);
    const [speechError, setSpeechError] = useState<string | null>(null);
    const [activeTopic, setActiveTopic] = useState('Exploração geral');
    const [interactionStage, setInteractionStage] = useState('Consulta');
    const [lastUserPrompt, setLastUserPrompt] = useState<string>('');
    const [proposalBusyPartId, setProposalBusyPartId] = useState<string | null>(null);
    const [proposalRejectFocusId, setProposalRejectFocusId] = useState<string | null>(null);
    const [availabilityBusy, setAvailabilityBusy] = useState(false);
    const [publisherEditBusy, setPublisherEditBusy] = useState(false);
    const [completionBusyPartId, setCompletionBusyPartId] = useState<string | null>(null);

    const permissionGate = useMemo(() => createPermissionGate(getPermissions()), [accessLevel, canSendZap]);
    const allowedAgentActions = useMemo(() => permissionGate.getAllowedAgentActions(), [permissionGate]);

    // Initializer for Speech Recognition
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);

    // Silence Detection (VAD) Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        // Cleanup function for media stream & Web Audio
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(console.error);
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    const stopListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setIsListening(false);
    };

    const toggleListening = async () => {
        if (isListening) {
            stopListening();
            return;
        }

        // Start recording
        try {
            setSpeechError(null);

            // Requisita acesso ao microfone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];

            // --- VAD (Voice Activity Detection) Setup ---
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.minDecibels = -55; // Threshold considered "silence"
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            let isCurrentlySilent = true;

            const checkSilence = () => {
                if (!isListening && mediaRecorder.state === 'inactive') return;

                analyser.getByteFrequencyData(dataArray);
                // Calcula volume médio bruto
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                if (average < 5) { // Threshold de volume (ajustável entre 2 e 10)
                    if (!isCurrentlySilent) {
                        isCurrentlySilent = true;
                        // Inicia o timer de silêncio de 2 segundos
                        silenceTimerRef.current = setTimeout(() => {
                            if (mediaRecorder.state !== 'inactive') {
                                console.log('[VAD] Auto-stopping due to 2s of silence');
                                stopListening();
                            }
                        }, 2000); // 2 segundos de silêncio para auto-stop
                    }
                } else {
                    if (isCurrentlySilent) {
                        isCurrentlySilent = false;
                        if (silenceTimerRef.current) {
                            clearTimeout(silenceTimerRef.current);
                            silenceTimerRef.current = null;
                        }
                    }
                }

                animationFrameRef.current = requestAnimationFrame(checkSilence);
            };
            checkSilence(); // Start monitoring loop
            // --- End VAD Setup ---

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstart = () => {
                setIsListening(true);
            };

            mediaRecorder.onstop = async () => {
                setIsListening(false);

                // Cleanup audio routes
                stream.getTracks().forEach(track => track.stop());
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(console.error);
                    audioContextRef.current = null;
                }
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                // Converter para Base64 para a Gemini API
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    // Extrair apenas o base64 descartando "data:audio/webm;base64,"
                    const base64Clean = base64data.split(',')[1];

                    if (base64Clean) {
                        // Enviar comando para IA
                        sendMessage(undefined, { mimeType: 'audio/webm', data: base64Clean });
                    }
                };
            };

            mediaRecorder.onerror = (event: any) => {
                console.error("MediaRecorder error", event.error);
                setSpeechError("Erro ao gravar áudio: " + event.error?.message);
                setIsListening(false);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();

        } catch (err: any) {
            console.error("Failed to start listening", err);

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setSpeechError('Permissão do microfone negada pelo navegador.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setSpeechError('Nenhum microfone encontrado no dispositivo.');
            } else {
                setSpeechError(`Erro no microfone: ${err.message || 'Desconhecido'}`);
            }
            setIsListening(false);
        }
    };

    // Local Rate Limit Tracking (15 req/min)
    const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
    const MAX_REQUESTS_PER_MINUTE = 15;

    // Context Data State
    const [specialEventsCtx, setSpecialEventsCtx] = useState<SpecialEventInput[]>([]);
    const [localNeedsCtx, setLocalNeedsCtx] = useState<LocalNeedsInput[]>([]);

    const canExecute = (actionType: AgentActionType) => allowedAgentActions.includes(actionType);
    const canSeeApprovalMicroUi = permissionGate.getAccessLevel() === 'elder';
    const {
        focusedPublisherId,
        shouldShowAvailabilityMicroUi,
        shouldShowPublisherEditMicroUi,
        currentWeekProposals,
        currentWeekCompletableParts,
        currentWeekCompletedParts,
    } = useTemporalChatSemanticContext({
        publishers,
        parts,
        currentWeekId,
        lastUserPrompt,
        activeTopic,
        canUpdateAvailability: canExecute('UPDATE_AVAILABILITY'),
        canUpdatePublisher: canExecute('UPDATE_PUBLISHER'),
        canSeeSensitiveData: permissionGate.canSeeSensitiveData(),
        accessLevel: permissionGate.getAccessLevel(),
    });

    const appendAssistantMessage = async (content: string) => {
        if (!sessionId) return;
        const message: ChatMessage = {
            role: 'assistant',
            content,
            timestamp: new Date()
        };
        await chatHistoryService.addMessage(sessionId, message);
        setMessages(prev => [...prev, message]);
    };

    const executeDirectAction = async (action: AgentAction, nextTopic?: string) => {
        if (isLoading) return;

        setIsLoading(true);
        setInteractionStage('Execução');
        if (nextTopic) setActiveTopic(nextTopic);

        try {
            const fallbackHistory = parts.map(part => workbookPartToHistoryRecord(part));
            const result = await agentActionService.executeAction(
                action,
                parts,
                publishers,
                historyRecords.length > 0 ? historyRecords : fallbackHistory,
                currentWeekId
            );

            if (result.success && onAction) onAction(result);

            if (result.success && result.actionType === 'NAVIGATE_WEEK' && result.data?.weekId && onNavigateToWeek) {
                onNavigateToWeek(result.data.weekId);
            }

            if (result.success && result.actionType === 'VIEW_S140' && currentWeekId) {
                await handleShareS140(currentWeekId, true);
            }

            await appendAssistantMessage(result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`);
        } catch (error) {
            await appendAssistantMessage(`❌ Erro ao executar ação direta: ${error instanceof Error ? error.message : 'Desconhecido'}`);
            setInteractionStage('Erro');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApproveProposal = async (partId: string) => {
        if (!profile?.id) {
            await appendAssistantMessage('⚠️ Não foi possível identificar o perfil autenticado para aprovar esta proposta.');
            return;
        }

        setProposalBusyPartId(partId);
        await executeDirectAction({
            type: 'APPROVE_PROPOSAL',
            params: { partId, elderId: profile.id },
            description: 'Aprovando proposta de designação'
        }, 'Aprovação de designações');
        setProposalBusyPartId(null);
    };

    const handleRejectProposal = async (partId: string, reason: string) => {
        setProposalBusyPartId(partId);
        await executeDirectAction({
            type: 'REJECT_PROPOSAL',
            params: { partId, reason },
            description: 'Rejeitando proposta de designação'
        }, 'Aprovação de designações');
        setProposalBusyPartId(null);
        setProposalRejectFocusId(null);
    };

    const handleUpdateAvailability = async (publisherId: string, date: string) => {
        const publisher = publishers.find(item => item.id === publisherId);
        if (!publisher) {
            await appendAssistantMessage('⚠️ Não foi possível localizar o publicador selecionado para atualizar a agenda.');
            return;
        }

        setAvailabilityBusy(true);
        await executeDirectAction({
            type: 'UPDATE_AVAILABILITY',
            params: {
                publisherName: publisher.name,
                unavailableDates: [date]
            },
            description: 'Atualizando indisponibilidade do publicador'
        }, 'Publicadores e elegibilidade');
        setAvailabilityBusy(false);
    };

    const handleQuickEditPublisher = async (publisherId: string, updates: Partial<Publisher>) => {
        const publisher = publishers.find(item => item.id === publisherId);
        if (!publisher) {
            await appendAssistantMessage('⚠️ Não foi possível localizar o publicador selecionado para edição rápida.');
            return;
        }

        setPublisherEditBusy(true);
        setInteractionStage('Execução');
        setActiveTopic('Publicadores e elegibilidade');
        try {
            const updatedPublisher = { ...publisher, ...updates };
            const result = await publisherMutationService.savePublisherWithPropagation(updatedPublisher, publisher);
            const summary = result.renamed
                ? ` e o rename foi propagado para ${result.propagatedParts} parte(s)`
                : '';

            if (onAction) {
                onAction({
                    success: true,
                    message: `Ficha principal de ${result.publisher.name} atualizada${summary}.`,
                    data: {
                        publisher: result.publisher,
                        propagatedParts: result.propagatedParts,
                        renamed: result.renamed,
                    },
                    actionType: 'UPDATE_PUBLISHER'
                });
            }

            await appendAssistantMessage(`✅ Ficha principal de ${result.publisher.name} atualizada${summary}.`);
        } catch (error) {
            await appendAssistantMessage(`❌ Erro ao atualizar ficha principal: ${error instanceof Error ? error.message : 'Desconhecido'}`);
        } finally {
            setPublisherEditBusy(false);
        }
    };

    const handlePreviewPublisherEdit = async (publisherId: string, updates: Partial<Publisher>) => {
        const publisher = publishers.find(item => item.id === publisherId);
        if (!publisher) {
            throw new Error('Publicador não encontrado para preview.');
        }

        return publisherMutationService.previewSavePublisher({ ...publisher, ...updates }, publisher);
    };

    const handleCompletePart = async (partId: string) => {
        setCompletionBusyPartId(partId);
        await executeDirectAction({
            type: 'COMPLETE_PART',
            params: { partId },
            description: 'Marcando parte como concluída'
        }, 'Designações da semana');
        setCompletionBusyPartId(null);
    };

    const handleUndoCompletePart = async (partId: string) => {
        setCompletionBusyPartId(partId);
        await executeDirectAction({
            type: 'UNDO_COMPLETE_PART',
            params: { partId },
            description: 'Desfazendo conclusão da parte'
        }, 'Designações da semana');
        setCompletionBusyPartId(null);
    };

    const inferTopicFromText = (text: string): string => {
        const normalized = text.toLowerCase();

        if (normalized.includes('s-140')) return 'S-140 e visualização';
        if (normalized.includes('s-89') || normalized.includes('whatsapp') || normalized.includes('zap')) return 'Comunicação';
        if (normalized.includes('design') || normalized.includes('parte') || normalized.includes('semana')) return 'Designações da semana';
        if (normalized.includes('publicador') || normalized.includes('irmão') || normalized.includes('irmã')) return 'Publicadores e elegibilidade';
        if (normalized.includes('evento') || normalized.includes('necessidade local')) return 'Eventos e necessidades locais';
        if (normalized.includes('histórico') || normalized.includes('anal')) return 'Histórico e analytics';

        return 'Exploração geral';
    };

    const inferStageFromActions = (actionTypes: string[]): string => {
        if (actionTypes.length === 0) return 'Consulta';
        if (actionTypes.some(type => type === 'GENERATE_WEEK' || type === 'ASSIGN_PART' || type === 'CLEAR_WEEK' || type === 'UPDATE_PUBLISHER' || type === 'UPDATE_AVAILABILITY')) {
            return 'Execução';
        }
        if (actionTypes.some(type => type === 'SIMULATE_ASSIGNMENT' || type === 'CHECK_SCORE' || type === 'GET_ANALYTICS' || type === 'FETCH_DATA')) {
            return 'Análise';
        }
        return 'Preparação';
    };

    // === REGISTRO DE PUBLICADORES (nome normalizado ↔ UUID) ===
    const normalizeStr = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const publisherRegistry = useMemo(() => {
        const map = new Map<string, string>(); // nome normalizado → UUID
        publishers.forEach(p => {
            map.set(normalizeStr(p.name), p.id);
            // Alias: primeiro nome (ex: "Eliezer" → mesmo UUID)
            const firstName = normalizeStr(p.name).split(' ')[0];
            if (!map.has(firstName)) map.set(firstName, p.id);
        });
        return map;
    }, [publishers]);

    /** Resolve publisherName → UUID usando o registro em memória */
    const resolvePublisherId = (name: string): string | null => {
        if (!name) return null;
        const norm = normalizeStr(name);
        // Exato
        if (publisherRegistry.has(norm)) return publisherRegistry.get(norm)!;
        // startsWith
        for (const [key, id] of publisherRegistry.entries()) {
            if (key.startsWith(norm) || norm.startsWith(key)) return id;
        }
        // contains
        for (const [key, id] of publisherRegistry.entries()) {
            if (key.includes(norm)) return id;
        }
        return null;
    };

    const now = Date.now();
    const recentRequests = requestTimestamps.filter(t => now - t < 60000);
    const creditsRemaining = Math.max(0, MAX_REQUESTS_PER_MINUTE - recentRequests.length);
    const oldestRequest = recentRequests.length > 0 ? recentRequests[0] : null;
    const refillInSeconds = oldestRequest ? Math.ceil((oldestRequest + 60000 - now) / 1000) : 0;

    // Report rate limit to parent
    useEffect(() => {
        if (onRateLimitChange) {
            onRateLimitChange(creditsRemaining, MAX_REQUESTS_PER_MINUTE, refillInSeconds);
        }
    }, [creditsRemaining, MAX_REQUESTS_PER_MINUTE, refillInSeconds, onRateLimitChange]);

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

                // 2. Local Needs
                const pendingNeeds = await localNeedsService.getPendingQueue();
                setLocalNeedsCtx(pendingNeeds.map(ln => ({
                    theme: ln.theme,
                    assigneeName: ln.assigneeName,
                    orderPosition: ln.orderPosition,
                    targetWeek: ln.targetWeek,
                    assignedToPartId: ln.assignedToPartId,
                })));

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

    // === TTS (Text-to-Speech) ===
    const speakText = (text: string) => {
        if (!window.speechSynthesis) return;

        // Cancelar qualquer fala em andamento
        window.speechSynthesis.cancel();

        // Limpar markdown, emojis e caracteres especiais para leitura mais natural
        const cleanText = text
            .replace(/[#*_~`>|]/g, '')             // Remove markdown
            .replace(/\[.*?\]\(.*?\)/g, '')         // Remove links markdown
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis faces
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Remove emojis symbols
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Remove emojis transport
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Remove emojis supplemental
            .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Remove misc symbols
            .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Remove dingbats
            .replace(/\n+/g, '. ')                  // Newlines → pausas
            .replace(/\s+/g, ' ')                   // Normalizar espaços
            .trim();

        if (!cleanText) return;

        // Limitar para evitar leituras muito longas (máx ~500 chars)
        // Cortar no último ponto/sentença antes do limite
        let truncated = cleanText;
        if (cleanText.length > 500) {
            const cut = cleanText.substring(0, 500);
            const lastSentence = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
            truncated = lastSentence > 100 ? cut.substring(0, lastSentence + 1) : cut + '.';
        }

        const utterance = new SpeechSynthesisUtterance(truncated);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1;      // Ligeiramente mais rápido
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Tentar encontrar uma voz pt-BR
        const voices = window.speechSynthesis.getVoices();
        const ptBrVoice = voices.find(v => v.lang === 'pt-BR') || voices.find(v => v.lang.startsWith('pt'));
        if (ptBrVoice) utterance.voice = ptBrVoice;

        window.speechSynthesis.speak(utterance);
    };

    const sendMessage = async (overrideInput?: string, audioData?: { mimeType: string, data: string }) => {
        // Safety check: Ensure overrideInput is a string and not a PointerEvent or other object
        const finalOverride = typeof overrideInput === 'string' ? overrideInput : undefined;
        const textToSend = finalOverride || input.trim();

        // Return only if no text AND no audio is present
        if ((!textToSend && !audioData) || !sessionId || isLoading) return;

        if (textToSend) {
            setLastUserPrompt(textToSend);
            setActiveTopic(inferTopicFromText(textToSend));
        }
        setInteractionStage('Processando');

        const isPureAudio = audioData && !textToSend;

        // Para texto normal, mostrar mensagem do usuário imediatamente
        if (!isPureAudio) {
            const userMsg: ChatMessage = {
                role: 'user',
                content: textToSend,
                timestamp: new Date(),
            };
            await chatHistoryService.addMessage(sessionId, userMsg);
            setMessages(prev => [...prev, userMsg]);
        } else {
            // Para áudio puro: mostrar indicador temporário e logar no audit_log
            const tempMsg: ChatMessage = {
                role: 'user',
                content: '🎤 Processando comando de voz...',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, tempMsg]);

            // Logar silenciosamente no audit_log
            try {
                await supabase.from('audit_log').insert([{
                    operation: 'AGENT_VOICE_INPUT',
                    table_name: 'temporal_chat',
                    user_id: null,
                    old_data: null,
                    new_data: {
                        mimeType: audioData.mimeType,
                        dataLength: audioData.data.length,
                        timestamp: new Date().toISOString()
                    }
                }]);
            } catch (err) {
                console.warn('[TemporalChat] Failed to log audio input to audit_log:', err);
            }
        }

        if (!overrideInput) setInput('');
        setIsLoading(true);


        try {
            // Check if agent is configured
            if (!isAgentConfigured()) {
                const errorMsg: ChatMessage = {
                    role: 'assistant',
                    content: '⚠️ Serviço de IA indisponível no momento. Tente novamente em instantes.',
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
                isPureAudio ? '' : textToSend,
                publishers,
                parts,
                historyRecords, // Passar histórico completo injetado
                messages, // chatHistory
                accessLevel, // accessLevel
                specialEventsCtx, // specialEvents
                localNeedsCtx, // localNeeds
                currentWeekId, // FOCUS WEEK ID provided by Parent (WorkbookManager)
                audioData // 👈 Injecting Multimodal Audio Base64
            );

            // Strip JSON action blocks for clean LN display, and remove any leaked UUIDs
            const stripJsonBlocks = (text: string) => {
                const noJson = text.replace(/```json[\s\S]*?```/gi, '');
                // Regex for UUID v4
                const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
                // Remove formats like "[ID: UUID]" or just the UUID
                const noUuid = noJson.replace(/\[?ID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?/gi, '').replace(uuidRegex, '');
                return noUuid.replace(/\n{3,}/g, '\n\n').trim();
            };

            // Base message from agent
            let rawContent = response.success ? response.message : `❌ Erro: ${response.error}`;

            // === TRANSCRIÇÃO: Extrair texto falado pelo usuário ===
            let transcribedText: string | null = null;
            if (isPureAudio && response.success) {
                const transcriptionMatch = rawContent.match(/\[TRANSCRIÇÃO:\s*(.*?)\]/i);
                if (transcriptionMatch) {
                    transcribedText = transcriptionMatch[1].trim();
                    // Remover a tag de transcrição da resposta do agente
                    rawContent = rawContent.replace(/\[TRANSCRIÇÃO:\s*.*?\]\s*/i, '').trim();
                }
            }

            // Se temos transcrição, substituir a mensagem temporária do usuário
            if (isPureAudio && transcribedText) {
                const realUserMsg: ChatMessage = {
                    role: 'user',
                    content: `🎤 ${transcribedText}`,
                    timestamp: new Date(),
                };
                // Substituir a msg temporária "Processando..." pela transcrição real
                setMessages(prev => {
                    const updated = [...prev];
                    // Encontrar a última mensagem do user com "Processando..."
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].role === 'user' && updated[i].content.includes('Processando comando de voz')) {
                            updated[i] = realUserMsg;
                            break;
                        }
                    }
                    return updated;
                });
                await chatHistoryService.addMessage(sessionId, realUserMsg);
            } else if (isPureAudio) {
                // Sem transcrição — manter o indicador com texto genérico
                const fallbackMsg: ChatMessage = {
                    role: 'user',
                    content: '🎤 (comando de voz)',
                    timestamp: new Date(),
                };
                setMessages(prev => {
                    const updated = [...prev];
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].role === 'user' && updated[i].content.includes('Processando comando de voz')) {
                            updated[i] = fallbackMsg;
                            break;
                        }
                    }
                    return updated;
                });
                await chatHistoryService.addMessage(sessionId, fallbackMsg);
            }

            const cleanedContent = stripJsonBlocks(rawContent);
            const actionTypes = (response.actions?.length ? response.actions : response.action ? [response.action] : []).map(action => action.type);
            setInteractionStage(inferStageFromActions(actionTypes));

            if (cleanedContent.trim() !== '') {
                const agentMsg: ChatMessage = {
                    role: 'assistant',
                    content: cleanedContent,
                    timestamp: new Date(),
                };

                await chatHistoryService.addMessage(sessionId, agentMsg);
                setMessages(prev => [...prev, agentMsg]);

                // === TTS: Falar a resposta se o input foi de voz ===
                if (isPureAudio && response.success) {
                    speakText(cleanedContent);
                }
            }

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

            // Handle Actions if present (MULTI-ACTION SUPPORT)
            const actionsToRun = response.actions?.length > 0 ? response.actions : (response.action ? [response.action] : []);

            // === PRE-RESOLUÇÃO DE PUBLISHER UUID ===
            // Para cada ASSIGN_PART sem publisherId, injeta o UUID via registry
            const resolvedActions = actionsToRun.map(action => {
                if ((action.type === 'ASSIGN_PART' || action.type === 'SIMULATE_ASSIGNMENT') &&
                    action.params.publisherName && !action.params.publisherId) {
                    const resolvedId = resolvePublisherId(action.params.publisherName);
                    if (resolvedId) {
                        console.log(`[TemporalChat] Resolveu '${action.params.publisherName}' → UUID ${resolvedId}`);
                        return { ...action, params: { ...action.params, publisherId: resolvedId } };
                    }
                }
                return action;
            });

            if (response.success && resolvedActions.length > 0) {
                console.log(`[TemporalChat] Executing ${resolvedActions.length} action(s):`, resolvedActions.map(a => a.type));

                // SPECIAL HANDLER FOR S-140 (VIEW or SHARE) — only first S-140 action runs
                const s140Action = resolvedActions.find(a => a.type === 'SHARE_S140_WHATSAPP' || a.type === 'VIEW_S140');
                if (s140Action) {
                    const weekId = s140Action.params.weekId;
                    const isViewOnly = s140Action.type === 'VIEW_S140';
                    if (weekId) handleShareS140(weekId, isViewOnly);
                    const actionLabel = isViewOnly ? 'Visualizando' : 'Abrindo painel de compartilhamento';
                    const systemMsg: ChatMessage = {
                        role: 'assistant',
                        content: `[S-140] ${actionLabel} para semana ${weekId}...`,
                        timestamp: new Date(),
                    };
                    await chatHistoryService.addMessage(sessionId, systemMsg);
                    setMessages(prev => [...prev, systemMsg]);
                    return;
                }

                // EXECUTE ALL ACTIONS SEQUENTIALLY
                const history = parts.map(p => workbookPartToHistoryRecord(p));
                const results: ActionResult[] = [];

                for (const action of resolvedActions) {
                    const result = await agentActionService.executeAction(action, parts, publishers, history, currentWeekId);
                    results.push(result);

                    // Notify parent on success (e.g. to refresh workbook data)
                    if (result.success && onAction) onAction(result);

                    // Auto-navigate on GENERATE_WEEK / NAVIGATE_WEEK
                    if (result.success && result.actionType === 'GENERATE_WEEK' && result.data?.generatedWeeks?.[0] && onNavigateToWeek) {
                        onNavigateToWeek(result.data.generatedWeeks[0]);
                    }
                    if (result.success && result.actionType === 'NAVIGATE_WEEK' && result.data?.weekId && onNavigateToWeek) {
                        onNavigateToWeek(result.data.weekId);
                    }
                }

                // Build consolidated feedback message
                const successCount = results.filter(r => r.success).length;
                const failCount = results.length - successCount;

                let feedbackContent: string;
                if (results.length === 1) {
                    // Single action: show result directly
                    const r = results[0];
                    feedbackContent = r.success
                        ? (r.actionType === 'CHECK_SCORE' ? r.message : `✅ ${r.message}`)
                        : `⚠️ Não foi possível realizar a ação: ${r.message}`;
                } else {
                    // Multiple actions: show summary + details
                    const lines = [`✅ ${successCount} de ${results.length} ações executadas${failCount > 0 ? ` (${failCount} falharam)` : ''}:`];
                    results.forEach((r, i) => {
                        const icon = r.success ? '✅' : '❌';
                        lines.push(`${icon} ${actionsToRun[i].description || actionsToRun[i].type}: ${r.message}`);
                    });
                    feedbackContent = lines.join('\n');
                }

                // === FEEDBACK PROATIVO: partes pendentes na semana em foco ===
                const hasAssignActions = resolvedActions.some(a =>
                    a.type === 'ASSIGN_PART' || a.type === 'GENERATE_WEEK' || a.type === 'CLEAR_WEEK'
                );
                if (hasAssignActions && currentWeekId) {
                    const weekParts = parts.filter(p => p.weekId === currentWeekId);

                    // Verificamos o resultado (actionType real retornado)
                    const gotCleared = results.some(r => r.success && r.actionType === 'CLEAR_WEEK');
                    const gotGenerated = results.some(r => r.success && r.actionType === 'GENERATE_WEEK');

                    let pendingCount = 0;

                    if (gotCleared) {
                        // Se limpou a semana inteira, TUDO está pendente
                        pendingCount = weekParts.length;
                    } else if (gotGenerated) {
                        // Se mandou AUTO-GERAR, dependemos do banco (o optimistic state pode falhar), 
                        // então contamos o que sobrou no optimistic state ou evitamos afirmar que tudo está vazio
                        // O ideal: gerar semana retorna dados atualizados, mas como é complexo, 
                        // verificamos se sobrou algo "não designado" no estado atual ignorando a ação. 
                        // (Na verdade, GENERATE preenche quase tudo, CLEAR esvazia).
                        // Para simplificar, não cravamos "faltam X" logo após um auto-generate, pois a API já avisa "32 designações geradas".
                        pendingCount = -1; // Flag para pular a contagem exata no feedback do chat

                        // Busca no history de results se o backend avisou quantas sobraram (ex: result message "Restam X")
                        const genResult = results.find(r => r.actionType === 'GENERATE_WEEK');
                        if (genResult && genResult.message.includes('Restam')) {
                            // Não precisamos injetar, a mensagem original já tem.
                        }
                    } else {
                        // Math padrão para ASSIGN_PART individual
                        const assignedInThisBatch = results.filter(r => r.success && r.actionType === 'ASSIGN_PART' && r.data?.assignedTo).length;
                        const removedInThisBatch = results.filter(r => r.success && r.actionType === 'ASSIGN_PART' && !r.data?.assignedTo).length;
                        const currentPending = weekParts.filter(p => !p.resolvedPublisherName).length - assignedInThisBatch + removedInThisBatch;
                        pendingCount = Math.max(0, currentPending);
                    }

                    if (pendingCount > 0) {
                        feedbackContent += `\n📋 Restam ${pendingCount} parte${pendingCount > 1 ? 's' : ''} sem designação nesta semana.`;
                    } else if (pendingCount === 0 && weekParts.length > 0 && !gotCleared) {
                        feedbackContent += `\n🎉 Todas as partes desta semana estão designadas!`;
                    }
                }

                const feedbackMsg: ChatMessage = {
                    role: 'assistant',
                    content: feedbackContent,
                    timestamp: new Date(),
                };
                await chatHistoryService.addMessage(sessionId, feedbackMsg);
                setMessages(prev => [...prev, feedbackMsg]);
                setInteractionStage(inferStageFromActions(results.map(result => result.actionType || '')));
            }

        } catch (error) {
            console.error('[TemporalChat] Error calling agent:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

            // Detect rate limit error and extract wait time
            // Detect rate limit error and extract wait time (Find MAX wait time if multiple)
            const rateLimitMatches = [...errorMessage.matchAll(/Please retry in ([\d.]+)s/g)];
            if (rateLimitMatches.length > 0) {
                setInteractionStage('Aguardando limite');
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
                setInteractionStage('Erro');
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

    const { contextualChips, visibleSlashCommands, buildPostResponseActions } = useTemporalChatSemanticControls({
        input,
        setInput,
        inputRef,
        currentWeekId,
        canSendZap,
        canSeeApprovalMicroUi,
        accessLevel,
        currentWeekProposals,
        currentWeekCompletableParts,
        currentWeekCompletedParts,
        shouldShowAvailabilityMicroUi,
        shouldShowPublisherEditMicroUi,
        messages,
        lastUserPrompt,
        canExecute,
        sendMessage,
        handleShareS140,
        executeDirectAction,
        handleApproveProposal,
        handleCompletePart,
        handleUndoCompletePart,
        setProposalRejectFocusId,
        setActiveTopic,
    });

    const floatingMicroUiItems = useMemo(() => {
        const items = [];

        if (canSeeApprovalMicroUi && currentWeekProposals.length > 0 && (canExecute('APPROVE_PROPOSAL') || canExecute('REJECT_PROPOSAL'))) {
            items.push({
                id: 'approval',
                title: 'Aprovação de propostas',
                subtitle: 'Preview e decisão da semana em foco',
                badge: `${currentWeekProposals.length} pendente(s)`,
                accent: '#F97316',
                content: (
                    <ProposalApprovalMicroUi
                        proposals={currentWeekProposals}
                        canApprove={canExecute('APPROVE_PROPOSAL')}
                        canReject={canExecute('REJECT_PROPOSAL')}
                        onApprove={handleApproveProposal}
                        onReject={handleRejectProposal}
                        busyPartId={proposalBusyPartId}
                        focusedRejectPartId={proposalRejectFocusId}
                    />
                )
            });
        }

        if (shouldShowAvailabilityMicroUi) {
            items.push({
                id: 'availability',
                title: 'Bloquear data',
                subtitle: 'Indisponibilidade do publicador em foco',
                accent: '#0891B2',
                content: (
                    <AvailabilityUpdateMicroUi
                        publishers={publishers}
                        defaultPublisherId={focusedPublisherId}
                        defaultDate={currentWeekId || new Date().toISOString().slice(0, 10)}
                        busy={availabilityBusy}
                        onConfirm={handleUpdateAvailability}
                    />
                )
            });
        }

        if (shouldShowPublisherEditMicroUi) {
            items.push({
                id: 'publisher-edit',
                title: 'Editar ficha',
                subtitle: 'Ajuste rápido com preview curto',
                accent: '#16A34A',
                content: (
                    <PublisherQuickEditMicroUi
                        publishers={publishers}
                        defaultPublisherId={focusedPublisherId}
                        busy={publisherEditBusy}
                        onPreview={handlePreviewPublisherEdit}
                        onConfirm={handleQuickEditPublisher}
                    />
                )
            });
        }

        if ((currentWeekCompletableParts.length > 0 || currentWeekCompletedParts.length > 0) && (canExecute('COMPLETE_PART') || canExecute('UNDO_COMPLETE_PART'))) {
            items.push({
                id: 'completion',
                title: 'Concluir partes',
                subtitle: 'Fechamento rápido da semana',
                badge: currentWeekCompletableParts.length > 0 ? `${currentWeekCompletableParts.length} pronta(s)` : `${currentWeekCompletedParts.length} concluída(s)`,
                accent: '#2563EB',
                content: (
                    <PartCompletionMicroUi
                        completableParts={currentWeekCompletableParts}
                        completedParts={currentWeekCompletedParts}
                        canComplete={canExecute('COMPLETE_PART')}
                        canUndo={canExecute('UNDO_COMPLETE_PART')}
                        busyPartId={completionBusyPartId}
                        onComplete={handleCompletePart}
                        onUndo={handleUndoCompletePart}
                    />
                )
            });
        }

        return items;
    }, [
        availabilityBusy,
        canExecute,
        canSeeApprovalMicroUi,
        completionBusyPartId,
        currentWeekCompletedParts,
        currentWeekCompletableParts,
        currentWeekId,
        currentWeekProposals,
        focusedPublisherId,
        handleApproveProposal,
        handleCompletePart,
        handlePreviewPublisherEdit,
        handleQuickEditPublisher,
        handleRejectProposal,
        handleUndoCompletePart,
        handleUpdateAvailability,
        proposalBusyPartId,
        proposalRejectFocusId,
        publisherEditBusy,
        publishers,
        shouldShowAvailabilityMicroUi,
        shouldShowPublisherEditMicroUi
    ]);

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    };

    // Unified Auto-trigger for initial command (Replacement Flow)
    useEffect(() => {
        const canSend = !isLoading && !isWorkbookLoading && parts.length > 0 && sessionId && currentWeekId;

        if (initialCommand && canSend) {
            // Check if we already processed this specific command string
            if (lastCommandRef.current === initialCommand) return;

            // Check if there are messages. If so, check if the last user message matches the command
            const alreadySent = messages.some(m => m.role === 'user' && m.content === initialCommand);
            if (alreadySent) {
                lastCommandRef.current = initialCommand;
                return;
            }

            console.log('[TemporalChat] Auto-triggering initial command:', initialCommand, 'weekId:', currentWeekId);
            lastCommandRef.current = initialCommand;

            // Delay ensures weekId has propagated to context before agent fires
            const timer = setTimeout(() => {
                sendMessage(initialCommand);
            }, 1500);

            return () => clearTimeout(timer);
        }
    }, [sessionId, initialCommand, isLoading, isWorkbookLoading, parts.length, messages.length === 0, currentWeekId]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

            <IntentContextBar
                currentWeekId={currentWeekId}
                accessLevel={accessLevel}
                activeTopic={activeTopic}
                stage={interactionStage}
            />

            <FloatingMicroUiHost items={floatingMicroUiItems} />

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px' }}>
                        <p>👋 Olá! Sou o Assistente RVM.</p>
                        <p style={{ fontSize: '12px', marginBottom: '16px' }}>Pergunte sobre publicadores, designações ou regras de elegibilidade.</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                            {getSuggestedQuestions().map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setInput(q); setTimeout(() => sendMessage(q), 100); }}
                                    style={{
                                        background: '#F3F4F6',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '16px',
                                        padding: '6px 14px',
                                        fontSize: '12px',
                                        color: '#4B5563',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseOver={e => { (e.target as HTMLElement).style.background = '#E5E7EB'; }}
                                    onMouseOut={e => { (e.target as HTMLElement).style.background = '#F3F4F6'; }}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'assistant' ? 'flex-start' : 'flex-end' }}>
                        <ChatMessageBubble
                            role={msg.role === 'assistant' ? 'assistant' : 'user'}
                            content={msg.content || '(sem conteúdo)'}
                            timestamp={msg.timestamp ? new Date(msg.timestamp) : undefined}
                            onShowMore={() => {
                                setInput('continue');
                                setTimeout(() => sendMessage(), 100);
                            }}
                        />
                        {msg.role === 'assistant' && (
                            <PostResponseActions actions={buildPostResponseActions(msg, idx)} />
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div style={{ marginBottom: '8px', color: '#9CA3AF' }}>
                        <span>🤖 Pensando...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {/* Pending actions panel removed - Actions are now direct or conversational */}

            <ChatActionChips chips={contextualChips} />

            {/* v9.3: BatchSimulationPanel removed - Agent uses existing Workbook UI */}

            <FloatingPanelShell
                id="share-s140-panel"
                isOpen={shareModalOpen}
                onClose={() => setShareModalOpen(false)}
                resetKey={`${shareWeekId}-${isViewMode ? 'view' : 'share'}`}
                title={isViewMode ? 'S-140' : 'Compartilhar S-140'}
                subtitle={shareWeekId ? `Semana ${shareWeekId}` : 'Visualização e envio'}
                accent={isViewMode ? '#065F46' : '#25D366'}
                width="min(520px, calc(100vw - 48px))"
                maxWidth="calc(100vw - 48px)"
                maxHeight="min(82vh, 820px)"
            >
                <div style={{ padding: '20px', overflowY: 'auto' }}>
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
            </FloatingPanelShell>

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
            <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px', display: 'flex', gap: '8px', position: 'relative' }}>
                <SlashCommandMenu commands={visibleSlashCommands} />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={rateLimitCountdown > 0 ? `Aguarde ${rateLimitCountdown}s...` : (speechError ? speechError : (isListening ? "Ouvindo..." : "Peça uma ação ou digite / para atalhos"))}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={isLoading || rateLimitCountdown > 0}
                    style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: speechError ? '#EF4444' : '#D1D5DB',
                        opacity: rateLimitCountdown > 0 ? 0.6 : 1
                    }}
                />
                <button
                    onClick={toggleListening}
                    disabled={isLoading || rateLimitCountdown > 0}
                    title={speechError || "Falar"}
                    style={{
                        background: isListening ? '#EF4444' : '#F3F4F6',
                        color: isListening ? '#FFFFFF' : '#374151',
                        border: '1px solid',
                        borderColor: isListening ? '#EF4444' : '#D1D5DB',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        cursor: (isLoading || rateLimitCountdown > 0) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: isListening ? 'pulse 1.5s infinite' : 'none'
                    }}
                >
                    {isListening ? '🛑' : '🎤'}
                </button>
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
        </div>
    );
}
