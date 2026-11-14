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
    if (email) {
      const byEmail = allPublishers.find((p) => p.email?.toLowerCase() === email);
      if (byEmail) return byEmail.id;
    }
    const norm = (s?: string | null) =>
      (s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const fullName = norm(profile?.full_name);
    if (fullName) {
      const byName = allPublishers.find(
        (p) =>
          norm(p.name) === fullName ||
          (Array.isArray(p.aliases) && p.aliases.some((a) => norm(a) === fullName))
      );
      if (byName) return byName.id;
    }
    const cleanPhone = (s?: string | null) => String(s || '').replace(/\D/g, '').slice(-8);
    const profPhone8 = cleanPhone(profile?.phone);
    if (profPhone8.length === 8) {
      const byPhone = allPublishers.find((p) => cleanPhone(p.phone) === profPhone8);
      if (byPhone) return byPhone.id;
    }
    // Conta de Admin de Sistema (ex.: zico.josias@gmail.com -> titular Admin Eliezer Rosa, id '3')
    if (isAdmin || profile?.role === 'admin') {
      const adminPub =
        allPublishers.find((p) => p.id === '3') ||
        allPublishers.find((p) => norm(p.name).includes('eliezer rosa'));
      return adminPub ? adminPub.id : '3';
    }
    return null;
  }, [
    profile?.publisher_id,
    profile?.full_name,
    profile?.phone,
    profile?.role,
    isAdmin,
    user?.email,
    allPublishers,
  ]);

  const userDisplayName = useMemo(() => {
    if (selfPublisherId) {
      const matchedPub = allPublishers.find((p) => p.id === selfPublisherId);
      if (matchedPub?.name) return matchedPub.name.trim();
      if (selfPublisherId === '3') return 'Eliezer Rosa';
    }
    return profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Irmão';
  }, [selfPublisherId, allPublishers, profile?.full_name, user?.email]);

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
    } catch (e: unknown) {
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

  // 4. Confirmação / Recusa direta pelo Micro-Modal de Briefing ou Carrossel S-89
  const syncS89StatusInMessages = useCallback(
    (partId: string, newStatus: 'confirmed' | 'refused') => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.cardType !== 'document-carousel' || !Array.isArray(m.cardData?.items)) {
            return m;
          }
          const updatedItems = m.cardData.items.map((rawItem) => {
            const item = rawItem as import('../ports/documentPort').DocumentCarouselItem;
            if (item.docType === 's89' && (item.partId === partId || item.id === `s89-${partId}`)) {
              return {
                ...item,
                portalResponse: newStatus,
                isConfirmed: newStatus === 'confirmed',
                isRefused: newStatus === 'refused',
              };
            }
            return rawItem;
          });
          return {
            ...m,
            cardData: {
              ...m.cardData,
              items: updatedItems,
            },
          };
        })
      );
    },
    []
  );

  const handleConfirmAssignment = async (partId: string) => {
    if (!selfPublisherId) {
      throw new Error('Seu login ainda não está vinculado a um registro de publicador.');
    }
    const result = await actionPort.confirmAssignment(partId, selfPublisherId);
    if (!result.success) {
      throw new Error(result.message);
    }
    syncS89StatusInMessages(partId, 'confirmed');
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

  const handleRefuseAssignment = async (partId: string, reason: string = 'Não poderei realizar a designação.') => {
    if (!selfPublisherId) {
      throw new Error('Seu login ainda não está vinculado a um registro de publicador.');
    }
    const result = await actionPort.refuseAssignment(partId, selfPublisherId, reason);
    if (!result.success) {
      throw new Error(result.message);
    }
    syncS89StatusInMessages(partId, 'refused');
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
      selfPublisherId={selfPublisherId}
      onCloseBriefing={() => setIsBriefingOpen(false)}
      onOpenBriefing={() => setIsBriefingOpen(true)}
      onSendMessage={handleSendMessage}
      onSelectCandidate={handleSelectCandidate}
      onActionConfirm={handleActionConfirm}
      onActionCancel={handleActionCancel}
      onConfirmAssignment={handleConfirmAssignment}
      onRefuseAssignment={handleRefuseAssignment}
      onClearHistory={handleClearHistory}
      onSignOut={() => {
        try {
          sessionStorage.setItem('cv_manual_logout', 'true');
        } catch {
          // ignore
        }
        void signOut();
      }}
    />
  );
};
