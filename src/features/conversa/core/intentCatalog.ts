/**
 * Catálogo Fechado de Intenções — Conversa RVM
 *
 * Cada intenção declara obrigatoriamente:
 * - intentId: Identificador único e imutável
 * - category: 'query' | 'document' | 'explain' | 'action'
 * - actionType: O AgentActionType governante que define a permissão herdada
 * - slots: Nomes dos slots que podem ser extraídos
 * - cardType: Tipo de visualização derivada na UI
 * - risk: 'low' | 'medium' | 'high'
 * - examplePhrases: Exemplos em linguagem natural para calibração do L0/L2
 */

import type { AgentActionType } from '../../../services/agentActionService';

export type IntentCategory = 'query' | 'document' | 'explain' | 'action';
export type CardVisualType = 'micro-panel' | 'document-carousel' | 'explain' | 'action-preview' | 'clarify';
export type IntentRisk = 'low' | 'medium' | 'high';

export interface IntentContract {
  intentId: string;
  title: string;
  category: IntentCategory;
  actionType: AgentActionType;
  slots: string[];
  cardType: CardVisualType;
  risk: IntentRisk;
  examplePhrases: string[];
}

export const CONVERSA_INTENTS: readonly IntentContract[] = [
  // --- CONSULTAS (Leitura) ---
  {
    intentId: 'query-my-assignments',
    title: 'Minhas designações futuras',
    category: 'query',
    actionType: 'QUERY_PUBLISHER_ASSIGNMENTS',
    slots: ['personName', 'timeRange'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'minhas designações',
      'o que eu tenho para fazer',
      'quais são minhas partes este mês',
      'quando é minha próxima parte',
      'minhas partes',
    ],
  },
  {
    intentId: 'query-week-assignments',
    title: 'Designações de uma semana específica',
    category: 'query',
    actionType: 'QUERY_WEEK_ASSIGNMENTS',
    slots: ['weekId', 'partType'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'quem faz a leitura dia 20',
      'quem está escalado na semana que vem',
      'designações da semana de 17/11',
      'quem é o presidente esta semana',
      'quem dirige o estudo bíblico dia 24',
      'quem faz joias na próxima semana',
    ],
  },
  {
    intentId: 'query-vacant-parts',
    title: 'Partes vagas ou pendentes',
    category: 'query',
    actionType: 'QUERY_VACANT_PARTS',
    slots: ['weekId', 'section'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'partes vagas da próxima semana',
      'quais partes ainda estão sem designação',
      'o que falta preencher este mês',
      'partes pendentes',
      'tem alguma parte vaga',
    ],
  },
  {
    intentId: 'query-last-participation',
    title: 'Última participação de um publicador',
    category: 'query',
    actionType: 'QUERY_LAST_PARTICIPATION',
    slots: ['personName', 'partType'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'quando o João participou por último',
      'última vez que a Maria fez leitura',
      'histórico recente do Carlos',
      'quando o Pedro fez discurso por último',
    ],
  },
  {
    intentId: 'query-eligibility',
    title: 'Elegibilidade de um publicador para partes',
    category: 'query',
    actionType: 'QUERY_ELIGIBILITY',
    slots: ['personName', 'partType'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'o Pedro pode fazer joias',
      'a irmã Ana pode ser ajudante',
      'quais partes o Marcos pode fazer',
      'elegibilidade do irmão Lucas',
    ],
  },
  {
    intentId: 'query-pending-weeks',
    title: 'Semanas pendentes de aprovação ou publicação',
    category: 'query',
    actionType: 'QUERY_PENDING_WEEKS',
    slots: ['month'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'quais semanas ainda não foram publicadas',
      'semanas pendentes de aprovação',
      'status das semanas do mês',
      'quais semanas estão em rascunho',
    ],
  },

  // --- DOCUMENTOS (Carrossel Cronológico) ---
  {
    intentId: 'view-s140',
    title: 'Programação da Reunião (S-140)',
    category: 'document',
    actionType: 'VIEW_S140',
    slots: ['weekId', 'month'],
    cardType: 'document-carousel',
    risk: 'low',
    examplePhrases: [
      'mostra o S-140 de novembro',
      'ver programação da semana que vem',
      'abrir o S-140',
      'programação da reunião de meio de semana',
      'ver S140',
      'S-140 desta semana',
    ],
  },
  {
    intentId: 'view-s89',
    title: 'Designação Individual de Estudante (S-89)',
    category: 'document',
    actionType: 'SHOW_MODAL',
    slots: ['personName', 'weekId', 'partType'],
    cardType: 'document-carousel',
    risk: 'low',
    examplePhrases: [
      'mostra o S-89 da Maria',
      'ver S89 do João',
      'meu S-89 da semana que vem',
      'cartão de designação da irmã Ana',
      'abrir S-89',
    ],
  },
  {
    intentId: 'view-s4',
    title: 'Relatório Mensal de Serviço de Campo (S-4)',
    category: 'document',
    actionType: 'SHOW_MODAL',
    slots: ['personName', 'month'],
    cardType: 'document-carousel',
    risk: 'low',
    examplePhrases: [
      'mostra o relatório S-4 de outubro do Carlos',
      'meu cartão S-4',
      'ver relatório de campo da irmã Beatriz',
      'S-4 deste mês',
    ],
  },
  {
    intentId: 'view-s1-consolidation',
    title: 'Consolidação de Relatório de Congregação (S-1)',
    category: 'document',
    actionType: 'SHOW_MODAL',
    slots: ['month'],
    cardType: 'document-carousel',
    risk: 'low',
    examplePhrases: [
      'mostra o fechamento S-1 de outubro',
      'ver relatório mensal da congregação',
      'relatório S-1 consolidado',
    ],
  },

  // --- EXPLICAÇÕES (Especialista com Fonte) ---
  {
    intentId: 'explain-ranking',
    title: 'Explicação de ranking / escolha de designado',
    category: 'explain',
    actionType: 'EXPLAIN_RANKING',
    slots: ['weekId', 'partType', 'personName'],
    cardType: 'explain',
    risk: 'low',
    examplePhrases: [
      'por que o Paulo foi escolhido',
      'como foi calculada a nota da Maria para leitura',
      'por que outro irmão não foi escalado',
      'critério de desempate do leitor',
    ],
  },
  {
    intentId: 'explain-engine-rules',
    title: 'Explicação das regras teocráticas do motor',
    category: 'explain',
    actionType: 'GET_ENGINE_RULES',
    slots: ['ruleName', 'partType'],
    cardType: 'explain',
    risk: 'low',
    examplePhrases: [
      'como funciona o rodízio',
      'o que diz o S-38 sobre ajudante de demonstração',
      'quais são as regras de gênero para partes de estudante',
      'o que é aquiescência tácita',
      'quais os critérios de intervalo entre discursos',
    ],
  },

  // --- ESCRITAS / AÇÕES COM PRÉVIA E CONFIRMAÇÃO ---
  {
    intentId: 'register-absence',
    title: 'Registrar período de ausência',
    category: 'action',
    actionType: 'UPDATE_AVAILABILITY',
    slots: ['personName', 'startDate', 'endDate', 'reason'],
    cardType: 'action-preview',
    risk: 'medium',
    examplePhrases: [
      'vou viajar de 18 a 25',
      'o João estará ausente em dezembro',
      'marcar ausência da Maria do dia 10 ao dia 20',
      'não poderei participar na última semana',
    ],
  },
  {
    intentId: 'approve-week-proposal',
    title: 'Aprovar proposta de semana',
    category: 'action',
    actionType: 'APPROVE_PROPOSAL',
    slots: ['weekId'],
    cardType: 'action-preview',
    risk: 'medium',
    examplePhrases: [
      'aprova a semana 47',
      'aprovar semana de 24/11',
      'aprovar rascunho da semana que vem',
    ],
  },
  {
    intentId: 'reassign-part-assignee',
    title: 'Substituir designado de uma parte',
    category: 'action',
    actionType: 'ASSIGN_PART',
    slots: ['weekId', 'partType', 'currentAssignee', 'newAssignee'],
    cardType: 'action-preview',
    risk: 'medium',
    examplePhrases: [
      'troca o leitor do dia 20 pelo Marcos',
      'substituir a irmã Ana pela Carla na demonstração',
      'mudar designado da leitura',
    ],
  },
  {
    intentId: 'undo-last-action',
    title: 'Desfazer última alteração',
    category: 'action',
    actionType: 'UNDO_LAST',
    slots: [],
    cardType: 'action-preview',
    risk: 'medium',
    examplePhrases: [
      'desfaz',
      'desfazer última ação',
      'voltar como estava antes',
      'cancelar alteração anterior',
    ],
  },
  {
    intentId: 'proactive-briefing',
    title: 'Briefing e pendências do usuário',
    category: 'query',
    actionType: 'QUERY_PUBLISHER_ASSIGNMENTS',
    slots: ['personName'],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'quais minhas pendências',
      'o que tenho que fazer',
      'meu briefing',
      'minhas pendências',
    ],
  },
  {
    intentId: 'clarify-ambiguity',
    title: 'Resposta a esclarecimento / escolha',
    category: 'query',
    actionType: 'FETCH_DATA',
    slots: ['choiceIndex', 'confirmation'],
    cardType: 'clarify',
    risk: 'low',
    examplePhrases: [
      'opção 1',
      'o segundo',
      '1',
      '2',
      'sim',
      'não',
    ],
  },
  {
    intentId: 'query-sync-status',
    title: 'Status da sincronização externa',
    category: 'query',
    actionType: 'FETCH_DATA',
    slots: [],
    cardType: 'micro-panel',
    risk: 'low',
    examplePhrases: [
      'como está a sincronização',
      'status da sincronização',
    ],
  },
] as const;

export type ConversaIntentId = (typeof CONVERSA_INTENTS)[number]['intentId'];

const INTENTS_BY_ID = new Map<string, IntentContract>(
  CONVERSA_INTENTS.map((intent) => [intent.intentId, intent])
);

export function getIntentContract(intentId: string): IntentContract | undefined {
  return INTENTS_BY_ID.get(intentId);
}

export function getAllIntents(): readonly IntentContract[] {
  return CONVERSA_INTENTS;
}
