import React, { useRef, useEffect } from 'react';
import type { ChatMessageItem } from '../core/conversationState';
import type { UserBriefingData } from '../ports/briefingPort';
import type { DisambiguationCandidate } from '../core/entityResolver';
import { Composer } from './Composer';
import { MicroPanel } from './MicroPanel';
import { ClarifyCard } from './ClarifyCard';
import { ExplainAnswer } from './ExplainAnswer';
import { DocumentCarousel } from './DocumentCarousel';
import { BriefingModal } from './BriefingModal';

interface ConversaShellProps {
  messages: ChatMessageItem[];
  isProcessing: boolean;
  briefingData: UserBriefingData | null;
  isBriefingOpen: boolean;
  userLabel?: string;
  selfPublisherId?: string | null;
  onCloseBriefing: () => void;
  onOpenBriefing: () => void;
  onSendMessage: (text: string) => void;
  onSelectCandidate: (candidate: DisambiguationCandidate, index: number) => void;
  onActionConfirm?: () => void;
  onActionCancel?: () => void;
  onConfirmAssignment?: (partId: string) => void | Promise<void>;
  onRefuseAssignment?: (partId: string, reason: string) => void | Promise<void>;
  onClearHistory?: () => void;
  onSignOut?: () => void;
}

export const ConversaShell: React.FC<ConversaShellProps> = ({
  messages,
  isProcessing,
  briefingData,
  isBriefingOpen,
  userLabel,
  selfPublisherId,
  onCloseBriefing,
  onOpenBriefing,
  onSendMessage,
  onSelectCandidate,
  onActionConfirm,
  onActionCancel,
  onConfirmAssignment,
  onRefuseAssignment,
  onClearHistory,
  onSignOut,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length, isProcessing]);

  return (
    <div className="cv-container">
      {/* Cabeçalho */}
      <header className="cv-header">
        <div className="cv-brand">
          <span>RVM · Conversa</span>
          <span className="cv-brand-badge">IA</span>
        </div>
        <div className="cv-header-actions">
          {userLabel && (
            <span className="cv-user-chip" title={userLabel}>
              {userLabel}
            </span>
          )}
          {briefingData && (
            <button
              type="button"
              className="cv-icon-btn"
              onClick={onOpenBriefing}
              title="Ver Pendências e Eventos (Briefing)"
            >
              🔔
              {briefingData.hasPendingItems && (
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--cv-warning)',
                    marginLeft: '-4px',
                    marginTop: '-8px',
                  }}
                />
              )}
            </button>
          )}
          {onClearHistory && messages.length > 0 && (
            <button
              type="button"
              className="cv-icon-btn"
              onClick={onClearHistory}
              title="Limpar conversa"
            >
              🗑️
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              className="cv-logout-btn"
              onClick={onSignOut}
              title="Sair da conta"
            >
              Sair
            </button>
          )}
        </div>
      </header>

      {/* Timeline de Mensagens */}
      <div className="cv-timeline">
        {messages.length === 0 ? (
          <div className="cv-empty-greeting">
            <h2>Olá! Em que posso ajudar?</h2>
            <p>
              Você pode perguntar sobre suas próximas designações, pedir para ver o S-140
              da semana, o cartão S-89 ou tirar dúvidas sobre o rodízio teocrático.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`cv-msg ${msg.sender === 'user' ? 'cv-msg-user' : 'cv-msg-assistant'}`}
            >
              <div className="cv-bubble">{msg.text}</div>

              {/* Renderização de Cards Especializados */}
              {msg.cardType === 'clarify' && msg.cardData?.candidates && (
                <ClarifyCard
                  title={msg.cardData.title || 'Escolha uma opção'}
                  candidates={msg.cardData.candidates}
                  onSelectCandidate={onSelectCandidate}
                  onCancel={onActionCancel}
                />
              )}

              {msg.cardType === 'explain' && msg.cardData && (
                <ExplainAnswer
                  data={{
                    found: Boolean(msg.cardData.found),
                    title: msg.cardData.title || 'Explicação',
                    summary: msg.cardData.summary || msg.text,
                    details: msg.cardData.details || [],
                    officialSource: msg.cardData.officialSource,
                  }}
                />
              )}

              {msg.cardType === 'document-carousel' && msg.cardData?.items && (
                <DocumentCarousel
                  items={msg.cardData.items as import('../ports/documentPort').DocumentCarouselItem[]}
                  initialFocusId={msg.cardData.initialFocusId}
                  selfPublisherId={selfPublisherId}
                  onConfirmAssignment={onConfirmAssignment}
                  onRefuseAssignment={onRefuseAssignment}
                />
              )}

              {(msg.cardType === 'micro-panel' || msg.cardType === 'action-preview') && (
                <MicroPanel
                  cardData={msg.cardData}
                  onActionConfirm={onActionConfirm}
                  onActionCancel={onActionCancel}
                />
              )}
            </div>
          ))
        )}

        {isProcessing && (
          <div className="cv-msg cv-msg-assistant">
            <div className="cv-bubble" style={{ opacity: 0.7 }}>
              Pensando...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Micro-Modal Proativo de Briefing */}
      {isBriefingOpen && briefingData && (
        <BriefingModal
          briefing={briefingData}
          onClose={onCloseBriefing}
          onConfirmAssignment={onConfirmAssignment}
          onRefuseAssignment={onRefuseAssignment}
        />
      )}

      {/* Compositor Fixo */}
      <Composer onSendMessage={onSendMessage} isProcessing={isProcessing} />
    </div>
  );
};

