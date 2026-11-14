/**
 * KnowledgePort — Adaptador da Base de Conhecimento Especialista do RVM
 *
 * Fornece respostas explicativas sempre fundamentadas em fontes canônicas oficiais,
 * combinando entradas correlatas quando a pergunta abrange múltiplos aspectos do RVM.
 * Se a dúvida não estiver catalogada, declara explicitamente a ausência do registro.
 */

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

export const knowledgePort = {
  getExplanation(query: string): ExplanationResult {
    const primary = findKnowledge(query);
    if (!primary) {
      return {
        found: false,
        title: 'Explicação Teocrática',
        summary:
          'Não encontrei uma regra catalogada ou instrução formal para essa dúvida específica no momento.',
        details: [
          'Para diretrizes não padronizadas, consulte as orientações do Superintendente da Reunião ou o Corpo de Anciãos.',
        ],
      };
    }

    const related = searchKnowledgeEntries(query, 3).filter(
      (entry) => entry.topicId !== primary.topicId
    );
    const details = [...primary.details];
    if (related.length > 0 && /invariante|geral|resumo|tudo|como funciona/i.test(query)) {
      for (const rel of related.slice(0, 2)) {
        details.push(`${rel.title}: ${rel.summary}`);
      }
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
