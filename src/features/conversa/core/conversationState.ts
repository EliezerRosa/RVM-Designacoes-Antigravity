/**
 * ConversationState — Gerenciamento do Contexto Curto da Conversa
 *
 * Mantém os ponteiros contextuais de curto prazo (última pessoa/semana citada,
 * estado de desambiguação em andamento e prévias de ação aguardando confirmação).
 */

import type { ConversaIntentId } from './intentCatalog';
import type { DisambiguationCandidate } from './entityResolver';
import type { ParsedSlots } from './nlu/l0Grammar';
import type { DocumentCarouselItem } from '../ports/documentPort';
import type { UpcomingAssignmentView } from '../ports/queryPort';
import type { WorkbookPart } from '../../../types';

export interface ActionPreviewState {
  intentId: ConversaIntentId;
  title: string;
  description: string;
  params: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface DisambiguationState {
  intentId: ConversaIntentId;
  slotName: string;
  candidates: DisambiguationCandidate[];
  pendingSlots: ParsedSlots;
}

export interface ConversaCardData {
  title?: string;
  description?: string;
  requiresConfirmation?: boolean;
  actionType?: string;
  status?: 'success' | 'error';
  type?: 'assignments-list' | 'week-parts-list' | 'vacant-parts-list' | 'pending-weeks-list';
  items?: Array<UpcomingAssignmentView | WorkbookPart | DocumentCarouselItem | { weekId: string }>;
  initialFocusId?: string;
  candidates?: DisambiguationCandidate[];
  found?: boolean;
  summary?: string;
  details?: string[];
  officialSource?: string;
}

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  intentId?: string;
  cardType?: 'micro-panel' | 'document-carousel' | 'explain' | 'action-preview' | 'clarify';
  cardData?: ConversaCardData;
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

