/**
 * ConversationState — Gerenciamento do Contexto Curto da Conversa
 *
 * Mantém os ponteiros contextuais de curto prazo (última pessoa/semana citada,
 * estado de desambiguação em andamento e prévias de ação aguardando confirmação).
 */

import type { ConversaIntentId } from './intentCatalog';
import type { DisambiguationCandidate } from './entityResolver';
import type { ParsedSlots } from './nlu/l0Grammar';

export interface ActionPreviewState {
  intentId: ConversaIntentId;
  title: string;
  description: string;
  params: Record<string, any>;
  requiresConfirmation: boolean;
}

export interface DisambiguationState {
  intentId: ConversaIntentId;
  slotName: string;
  candidates: DisambiguationCandidate[];
  pendingSlots: ParsedSlots;
}

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  intentId?: string;
  cardType?: 'micro-panel' | 'document-carousel' | 'explain' | 'action-preview' | 'clarify';
  cardData?: any;
}

export interface ConversaContextState {
  lastPersonId?: string;
  lastPersonName?: string;
  lastWeekId?: string;
  lastMonth?: string;
  activeDisambiguation?: DisambiguationState;
  pendingAction?: ActionPreviewState;
  voiceActive: boolean;
}

export function createInitialContext(): ConversaContextState {
  return {
    voiceActive: false,
  };
}
