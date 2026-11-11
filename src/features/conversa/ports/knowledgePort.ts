/**
 * KnowledgePort — Adaptador da Base de Conhecimento Teocrática
 *
 * Fornece respostas explicativas sempre acompanhadas de citação oficial da fonte.
 * Se a dúvida não estiver catalogada, declara explicitamente a ausência do registro.
 */

import type { KnowledgeEntry } from '../knowledge/rvmRulesKnowledge';
import { findKnowledge, RVM_KNOWLEDGE_BASE } from '../knowledge/rvmRulesKnowledge';

export interface ExplanationResult {
  found: boolean;
  title: string;
  summary: string;
  details: string[];
  officialSource?: string;
}

export const knowledgePort = {
  getExplanation(query: string): ExplanationResult {
    const entry = findKnowledge(query);
    if (!entry) {
      return {
        found: false,
        title: 'Explicação Teocrática',
        summary: 'Não encontrei uma regra catalogada ou instrução formal para essa dúvida específica no momento.',
        details: [
          'Para diretrizes não padronizadas, consulte as orientações do Superintendente da Reunião ou o Corpo de Anciãos.',
        ],
      };
    }

    return {
      found: true,
      title: entry.title,
      summary: entry.summary,
      details: entry.details,
      officialSource: entry.officialSource,
    };
  },

  getAllTopics(): readonly KnowledgeEntry[] {
    return RVM_KNOWLEDGE_BASE;
  },
};
