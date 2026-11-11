import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import type { Publisher } from '../../../types';
import type { ChatMessageItem, ConversaContextState } from '../core/conversationState';
import { createInitialContext } from '../core/conversationState';
import { resolveIntent } from '../core/nlu/l2Classifier';
import { planTurn } from '../core/cardPlanner';
import { queryPort } from '../ports/queryPort';
import { briefingPort, type UserBriefingData } from '../ports/briefingPort';
import { actionPort } from '../ports/actionPort';
import { voicePort } from '../ports/voicePort';
import type { DisambiguationCandidate } from '../core/entityResolver';
import { ConversaShell } from './ConversaShell';

const BRIEFING_DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutos

export const ConversaApp: React.FC = () => {
  const { user, profile, isAdmin, signOut } = useAuth();
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

  const selfPublisherId = useMemo(() => {
    if (profile?.publisher_id) return profile.publisher_id;
    const email = user?.email?.toLowerCase();
    if (!email) return null;
    return allPublishers.find((p) => p.email?.toLowerCase() === email)?.id || null;
  }, [profile?.publisher_id, user?.email, allPublishers]);

  const userDisplayName = useMemo(() => {
    return profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Irmão';
  }, [profile?.full_name, user?.email]);

  // 1. Carga inicial de publicadores e semanas respeitando escopo do usuário
  useEffect(() => {
    if (isPermsLoading || !user) return;
    let active = true;
    Promise.all([
      queryPort.getPublishers(gate, profile?.publisher_id),
      queryPort.getAvailableWeeks(),
    ]).then(([pubs, weeks]) => {
      if (!active) return;
      setAllPublishers(pubs);
      setAvailableWeeks(weeks);
    });
    return () => {
      active = false;
    };
  }, [isPermsLoading, user, gate, profile?.publisher_id]);

  // 2. Disparo do Briefing Proativo (Boot, Login, Retorno de Foco)
  const triggerBriefing = useCallback(
    async (force: boolean = false) => {
      if (!user) return;
      const now = Date.now();
      if (!force && now - lastBriefingTimeRef.current < BRIEFING_DEBOUNCE_MS) {
        return;
      }
      lastBriefingTimeRef.current = now;

      try {
        const briefing = await briefingPort.getUserBriefing(
          user.id,
          selfPublisherId,
          userDisplayName
        );
        setBriefingData(briefing);

        if (briefing.hasPendingItems && !force) {
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
        if (briefing.hasPendingItems && !force) {
          voicePort.speak(briefing.spokenSummary);
        }
      } catch (e) {
        console.warn('[ConversaApp] Erro ao carregar briefing:', e);
      }
    },
    [user, selfPublisherId, userDisplayName]
  );

  // Executa no boot / quando usuário carrega
  useEffect(() => {
    if (!isPermsLoading && user) {
      void triggerBriefing(false);
    }
  }, [user, isPermsLoading, triggerBriefing]);

  // Listener para retorno de foco da janela (visibilitychange / window.onfocus)
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible' && user) {
        void triggerBriefing(false);
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
        availableWeeks,
        {
          publisherId: selfPublisherId,
          publisherName: userDisplayName,
          isAdmin,
        }
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

  // 4. Confirmação / Recusa direta pelo Micro-Modal de Briefing
  const handleConfirmAssignment = async (partId: string) => {
    if (!selfPublisherId) {
      throw new Error('Seu login ainda não está vinculado a um registro de publicador.');
    }
    const result = await actionPort.confirmAssignment(partId, selfPublisherId);
    if (!result.success) {
      throw new Error(result.message);
    }
    voicePort.speak(result.message);
    setMessages((prev) => [
      ...prev,
      {
        id: `confirm_${Date.now()}`,
        sender: 'assistant',
        text: result.message,
        timestamp: Date.now(),
        cardType: 'micro-panel',
        cardData: {
          status: 'success',
          title: 'Confirmação de Designação',
          description: result.message,
        },
      },
    ]);
    await triggerBriefing(true);
  };

  const handleRefuseAssignment = async (partId: string, reason: string) => {
    if (!selfPublisherId) {
      throw new Error('Seu login ainda não está vinculado a um registro de publicador.');
    }
    const result = await actionPort.refuseAssignment(partId, selfPublisherId, reason);
    if (!result.success) {
      throw new Error(result.message);
    }
    voicePort.speak(result.message);
    setMessages((prev) => [
      ...prev,
      {
        id: `refuse_${Date.now()}`,
        sender: 'assistant',
        text: result.message,
        timestamp: Date.now(),
        cardType: 'micro-panel',
        cardData: {
          status: 'success',
          title: 'Recusa Registrada',
          description: result.message,
        },
      },
    ]);
    await triggerBriefing(true);
  };

  // 5. Seleção de Candidato em Desambiguação
  const handleSelectCandidate = (_candidate: DisambiguationCandidate, index: number) => {
    void handleSendMessage(`${index + 1}`);
  };

  const handleActionConfirm = () => {
    void handleSendMessage('sim');
  };

  const handleActionCancel = () => {
    void handleSendMessage('não');
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
      userLabel={userDisplayName}
      onCloseBriefing={() => setIsBriefingOpen(false)}
      onOpenBriefing={() => setIsBriefingOpen(true)}
      onSendMessage={handleSendMessage}
      onSelectCandidate={handleSelectCandidate}
      onActionConfirm={handleActionConfirm}
      onActionCancel={handleActionCancel}
      onConfirmAssignment={handleConfirmAssignment}
      onRefuseAssignment={handleRefuseAssignment}
      onClearHistory={handleClearHistory}
      onSignOut={() => void signOut()}
    />
  );
};
