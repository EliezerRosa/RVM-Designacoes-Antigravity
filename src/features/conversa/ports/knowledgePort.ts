/**
 * KnowledgePort — Adaptador Especialista com Visão Total do RVM e Contexto Vivo
 *
 * Responde dúvidas teocráticas e operacionais sobre todo o ecossistema RVM Designações:
 * - Permissões reais e escopo do usuário autenticado (PermissionGate dinâmico)
 * - Panorama completo de funcionalidades, abas e capacidades da Conversa RVM + sistema web
 * - Síntese multi-tópico das 22 entradas canônicas (M-0..M-12, I-0..I-7, S-38-T, Z-API, CCA/CS)
 * - Enriquecimento com contexto vivo da congregação (publicadores no escopo e semanas carregadas)
 */

import type { ActiveTab, PermissionGate } from '../../../services/permissionService';
import type { Publisher } from '../../../types';
import { CONVERSA_INTENTS } from '../core/intentCatalog';
import { formatDateBr } from '../core/dateFormat';
import type { KnowledgeEntry } from '../knowledge/rvmRulesKnowledge';
import {
  findKnowledge,
  RVM_KNOWLEDGE_BASE,
  searchKnowledgeEntries,
} from '../knowledge/rvmRulesKnowledge';

export interface ExplanationResult {
  found: boolean;
  title: string;
  summary: string;
  details: string[];
  officialSource?: string;
}

export interface SpecialistContextInput {
  userContext?: {
    publisherId?: string | null;
    publisherName?: string | null;
    isAdmin?: boolean;
  };
  gate?: PermissionGate;
  allPublishers?: Publisher[];
  availableWeeks?: string[];
  lastWeekId?: string;
  lastPersonName?: string;
}

const TAB_LABELS: Array<{ tab: ActiveTab; label: string }> = [
  { tab: 'workbook', label: 'Apostila (Planejamento/Relatórios/Análises)' },
  { tab: 'publishers', label: 'Publicadores' },
  { tab: 'communication', label: 'Comunicação Z-API' },
  { tab: 'monthly-reports', label: 'Relatório Mensal (S-4/S-1)' },
  { tab: 's38-profiles', label: 'Regras S-38 / Perfis' },
  { tab: 'territories', label: 'Territórios' },
  { tab: 'backup', label: 'Backup' },
  { tab: 'admin', label: 'Administração & Permissões' },
];

function normText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,:;()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLiveCongregationLine(ctx?: SpecialistContextInput): string | undefined {
  if (!ctx) return undefined;
  const pubCount = ctx.allPublishers?.length ?? 0;
  const weeks = ctx.availableWeeks ?? [];
  if (!pubCount && !weeks.length) return undefined;

  const todayIso = new Date().toISOString().split('T')[0];
  const nextWeek = weeks.find((w) => w >= todayIso) || weeks[weeks.length - 1];
  const parts: string[] = [];
  if (pubCount > 0) parts.push(`${pubCount} publicador(es) visível(is) no seu escopo`);
  if (weeks.length > 0) {
    parts.push(`${weeks.length} semana(s) carregada(s)${nextWeek ? ` (próxima ref.: ${formatDateBr(nextWeek)})` : ''}`);
  }
  return `Contexto atual carregado: ${parts.join(' e ')}.`;
}

function isPermissionsQuestion(norm: string): boolean {
  return /\b(permitid[ao]|permiss[ao]o|permiss[oõ]es|posso\s+(?:fazer|executar|consultar|ver|editar|alterar)|o\s+que\s+(?:eu\s+)?posso|o\s+que\s+e\s+que\s+e\s+permitido|meu\s+acesso|meu\s+nivel|autorizad[ao])\b/.test(
    norm
  );
}

function isCapabilitiesQuestion(norm: string): boolean {
  return /\b(funcionalidades?|capacidades?|habilidades?|o\s+que\s+voce\s+(?:sabe\s+)?faz(?:er)?|como\s+(?:usar|funciona)\s+(?:o\s+)?(?:conversa|chat|assistente)|comandos?|exemplos?|visao\s+geral|panorama|o\s+que\s+tem\s+no\s+rvm|modulos?\s+do\s+rvm)\b/.test(
    norm
  );
}

function buildUserPermissionsExplanation(ctx: SpecialistContextInput): ExplanationResult {
  const gate = ctx.gate!;
  const isAdmin = Boolean(ctx.userContext?.isAdmin || gate.isFullAdmin());
  const selfPub = ctx.userContext?.publisherId
    ? ctx.allPublishers?.find((p) => p.id === ctx.userContext?.publisherId)
    : undefined;
  const userName = selfPub?.name || ctx.userContext?.publisherName || 'Usuário conectado';
  const roleLabel = isAdmin
    ? 'Administrador Geral (acesso completo)'
    : selfPub
      ? `${selfPub.condition}${selfPub.funcao ? ` · ${selfPub.funcao}` : ''}`
      : 'Publicador conectado';

  const scope = typeof gate.getPublisherScope === 'function' ? gate.getPublisherScope() : undefined;
  const scopeDesc =
    isAdmin || scope?.accessLevel === 'all'
      ? 'Todos os publicadores da congregação (`all`)'
      : scope?.accessLevel === 'filtered'
        ? 'Grupo filtrado conforme perfil (`filtered`)'
        : 'Apenas seus próprios dados (`self`)';

  const visibleTabs = TAB_LABELS.filter(({ tab }) => gate.canViewTab(tab)).map((t) => t.label);

  const allowedIntents = CONVERSA_INTENTS.filter((intent) => {
    if (intent.intentId === 'clarify-ambiguity' || intent.intentId === 'fallback.unknown') return false;
    if (intent.intentId === 'view-s1-consolidation' && !gate.canViewTab('monthly-reports') && !isAdmin) {
      return false;
    }
    return gate.canAgentAction(intent.actionType);
  });

  const allowedQueries = allowedIntents.filter((i) => i.category !== 'action').map((i) => i.description);
  const allowedActions = allowedIntents.filter((i) => i.category === 'action').map((i) => i.description);

  const details: string[] = [
    `Perfil e Escopo: ${userName} — ${roleLabel} | Escopo de dados: ${scopeDesc}.`,
    `Abas RVM liberadas (${visibleTabs.length}): ${visibleTabs.length ? visibleTabs.join(', ') : 'Acesso focado em portal próprio'}.`,
    `Consultas & Documentos permitidos aqui (${allowedQueries.length}): ${allowedQueries.slice(0, 8).join('; ')}${allowedQueries.length > 8 ? ` (+${allowedQueries.length - 8} consultas)` : ''}.`,
    `Micro-ações autorizadas (${allowedActions.length}): ${allowedActions.length
      ? allowedActions.join('; ')
      : 'Confirmar/recusar suas designações S-89 no carrossel e registrar suas ausências.'
    }.`,
  ];

  const liveLine = buildLiveCongregationLine(ctx);
  if (liveLine) details.push(liveLine);

  return {
    found: true,
    title: `O que é permitido no seu perfil (${userName})`,
    summary: isAdmin
      ? `${userName} opera com perfil ${roleLabel}, tendo acesso integral às abas do RVM, consultas vivas, documentos oficiais (S-140, S-89, S-4, S-1) e todas as micro-ações governadas.`
      : `${userName} (${roleLabel}) opera com escopo ${scopeDesc}, podendo consultar suas designações, visualizar documentos liberados e executar apenas as ações autorizadas ao seu perfil.`,
    details,
    officialSource: 'PermissionGate & Política RBAC do RVM (`permissionService.ts`)',
  };
}

function buildCapabilitiesExplanation(ctx?: SpecialistContextInput): ExplanationResult {
  const userName = ctx?.userContext?.publisherName;
  const gate = ctx?.gate;
  const isAdmin = Boolean(ctx?.userContext?.isAdmin || gate?.isFullAdmin?.());

  const details: string[] = [
    '1. Perguntas Especialistas (Visão Total do RVM): responde sobre propósito do sistema, regras S-38-T, motor lexicográfico M-0 a M-12, garantia de estudante, prioridade de irmãs, gênero/parentesco, memória de recusa M-12, relatórios S-4/S-1 (I-0 a I-7), mensageria Z-API, Comissão de Serviço, Territórios, Backup e permissões.',
    '2. Consultas em Tempo Real: suas designações ("quantas designações eu tenho"), escalas da semana, partes vagas, semanas pendentes, elegibilidade de qualquer publicador, explicação detalhada do ranking, perfis/privilégios, listas filtradas (ex.: "listar anciãos") e analytics / Fila NL / Eventos.',
    '3. Documentos no Carrossel Flutuante: exibe S-140, S-89 (com botões Confirmar e Não Poderei disparando os webhooks Z-API nos seus próprios cartões), além de S-4 e S-1 conforme permissão.',
    isAdmin
      ? '4. Micro-Ações Completas (Admin/SRVM): confirmar/recusar S-89, registrar ausências, gerar semana, aprovar rascunhos, designar/substituir partes (com checagem S-38/gênero), rejeitar propostas, limpar semana, concluir partes, incluir temas na Fila NL e desfazer.'
      : '4. Micro-Ações do seu Perfil: confirmar/recusar suas designações S-89 (via webhook Z-API), registrar períodos de ausência e executar ações operacionais extras se liberadas para sua função.',
  ];

  const liveLine = buildLiveCongregationLine(ctx);
  if (liveLine) details.push(liveLine);

  return {
    found: true,
    title: 'Funcionalidades do Especialista RVM & Conversa IA',
    summary: userName
      ? `Olá, ${userName}! Posso atuar como especialista completo do RVM Designações: responder qualquer regra ou arquitetura do sistema, consultar dados vivos da congregação, abrir S-140/S-89/S-4/S-1 no carrossel e executar todas as micro-ações permitidas ao seu perfil.`
      : 'Posso atuar como especialista completo do RVM Designações: explicar regras S-38 e invariantes M-0..M-12 / I-0..I-7, consultar dados vivos da congregação, exibir documentos S-140/S-89/S-4/S-1 e executar micro-ações autorizadas pelo seu perfil.',
    details,
    officialSource: 'Catálogo Conversa RVM (29 intenções) + Base Canônica RVM (22 tópicos)',
  };
}

export const knowledgePort = {
  getExplanation(query: string, ctx?: SpecialistContextInput): ExplanationResult {
    const norm = normText(query);

    if (ctx?.gate && isPermissionsQuestion(norm)) {
      return buildUserPermissionsExplanation(ctx);
    }

    if (isCapabilitiesQuestion(norm)) {
      return buildCapabilitiesExplanation(ctx);
    }

    const primary = findKnowledge(query);
    if (!primary) {
      return {
        found: false,
        title: 'Especialista RVM Designações',
        summary:
          'Não identifiquei um tópico exato para essa frase, mas posso responder sobre regras S-38, motor M-0..M-12, relatórios S-4/S-1, mensageria Z-API, permissões, abas do RVM, consultar dados vivos ou executar ações do seu perfil.',
        details: [
          'Exemplos de perguntas: "Quais são suas funcionalidades?", "O que é que é permitido eu fazer?", "Como funciona o motor de rodízio M-0?" ou "Quais são as invariantes dos botões Z-API?".',
          'Exemplos de consultas e ações: "Quantas designações eu tenho?", "Mostrar S-89", "Quais partes estão vagas?" ou "O irmão Lucas pode fazer Leitura?".',
        ],
      };
    }

    const related = searchKnowledgeEntries(query, 4).filter(
      (entry) => entry.topicId !== primary.topicId
    );
    const details = [...primary.details];
    if (related.length > 0) {
      for (const rel of related.slice(0, 2)) {
        details.push(`${rel.title}: ${rel.summary}`);
      }
    }

    const liveLine = buildLiveCongregationLine(ctx);
    if (liveLine) {
      details.push(liveLine);
    }

    return {
      found: true,
      title: primary.title,
      summary: primary.summary,
      details,
      officialSource: primary.officialSource,
    };
  },

  getAllTopics(): readonly KnowledgeEntry[] {
    return RVM_KNOWLEDGE_BASE;
  },
};
