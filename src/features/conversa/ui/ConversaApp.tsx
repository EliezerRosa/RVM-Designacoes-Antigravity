import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import type { Publisher } from '../../../types';
import type { ChatMessageItem, ConversaContextState } from '../core/conversationState';
import { createInitialContext } from '../core/conversationState';
import { resolveIntent } from '../core/nlu/l2Classifier';
import { planTurn } from '../core/cardPlanner';
import { queryPort } from '../ports/queryPort';
import { briefingPort, type UserBriefingData } from '../ports/briefingPort';
import { voicePort } from '../ports/voicePort';
import type { DisambiguationCandidate } from '../core/entityResolver';
import { ConversaShell } from './ConversaShell';

const BRIEFING_DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutos

export const ConversaApp: React.FC = () => {
  const { user, profile } = useAuth();
  const { permissions: gate, isLoading: isPermsLoading } = usePermissions(profile);

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [contextState, setContextState] = useState<ConversaContextState>(createInitialContext);
  const [isProcessing, setIsProcessing] = useState(false);
  const [allPublishers, setAllPublishers] = useState<Publisher[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);

  // Estado do Briefing Proativo (Requisito 10)
  const [briefingData, setBriefingData] = useState<UserBriefingData | null>(null);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const lastBriefingTimeRef = useRef<number>(0);

  // 1. Carga inicial de publicadores e semanas
  useEffect(() => {
    let active = true;
    Promise.all([queryPort.getPublishers(), queryPort.getAvailableWeeks()]).then(
      ([pubs, weeks]) => {
        if (!active) return;
        setAllPublishers(pubs);
        setAvailableWeeks(weeks);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  // 2. Disparo do Briefing Proativo (Boot, Login, Retorno de Foco)
  const triggerBriefing = useCallback(
    async (force: boolean = false) => {
      const now = Date.now();
      if (!force && now - lastBriefingTimeRef.current < BRIEFING_DEBOUNCE_MS) {
        return;
      }
      lastBriefingTimeRef.current = now;

      const userName = profile?.full_name || user?.email?.split('@')[0] || 'Irmão';
      const pubId = profile?.publisher_id || null;

      try {
        const briefing = await briefingPort.getUserBriefing(user?.id || 'anon', pubId, userName);
        setBriefingData(briefing);

        if (briefing.hasPendingItems) {
          setIsBriefingOpen(true);
        }

        // Escreve saudação se timeline estiver vazia
        setMessages((prev) => {
          if (prev.length === 0) {
            return [
              {
                id: `greeting_${now}`,
                sender: 'assistant',
                text: briefing.writtenGreeting,
                timestamp: now,
              },
            ];
          }
          return prev;
        });

        // Fala o resumo se áudio estiver habilitado
        if (briefing.hasPendingItems) {
          voicePort.speak(briefing.spokenSummary);
        }
      } catch (e) {
        console.warn('[ConversaApp] Erro ao carregar briefing:', e);
      }
    },
    [user, profile]
  );

  // Executa no boot / quando usuário carrega
  useEffect(() => {
    if (!isPermsLoading && user) {
      triggerBriefing(false);
    }
  }, [user, isPermsLoading, triggerBriefing]);

  // Listener para retorno de foco da janela (visibilitychange / window.onfocus)
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible' && user) {
        triggerBriefing(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, triggerBriefing]);

  // 3. Envio e Processamento de Mensagens
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    voicePort.stopSpeaking();

    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // 1. Resolução NLU (L1 Cache -> L0 Gramática -> L2 Classificador)
      const nlu = await resolveIntent(text);

      // 2. Planejamento do Turno e Construção de Card
      const planned = await planTurn(
        nlu,
        contextState,
        gate,
        allPublishers,
        availableWeeks
      );

      // 3. Fala a resposta sintetizada
      if (planned.spokenText) {
        voicePort.speak(planned.spokenText);
      }

      setMessages((prev) => [...prev, planned.message]);
      setContextState(planned.updatedContext);
    } catch (e: any) {
      console.error('[ConversaApp] Erro no processamento:', e);
      const errMsg: ChatMessageItem = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: 'Ocorreu uma falha momentânea ao processar sua solicitação. Por favor, tente novamente.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Seleção de Candidato em Desambiguação
  const handleSelectCandidate = (_candidate: DisambiguationCandidate, index: number) => {
    handleSendMessage(`${index + 1}`);
  };

  const handleActionConfirm = () => {
    handleSendMessage('sim');
  };

  const handleActionCancel = () => {
    handleSendMessage('não');
  };

  const handleClearHistory = () => {
    voicePort.stopSpeaking();
    setMessages([]);
    setContextState(createInitialContext());
  };

  return (
    <ConversaShell
      messages={messages}
      isProcessing={isProcessing}
      briefingData={briefingData}
      isBriefingOpen={isBriefingOpen}
      onCloseBriefing={() => setIsBriefingOpen(false)}
      onOpenBriefing={() => setIsBriefingOpen(true)}
      onSendMessage={handleSendMessage}
      onSelectCandidate={handleSelectCandidate}
      onActionConfirm={handleActionConfirm}
      onActionCancel={handleActionCancel}
      onClearHistory={handleClearHistory}
    />
  );
};
