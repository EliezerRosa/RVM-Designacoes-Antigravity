/**
 * EntityResolver — Resolução de Entidades contra Dados Reais do Banco
 *
 * Garante que nenhuma pessoa, semana ou parte seja inventada.
 * Se houver múltiplos candidatos com o mesmo primeiro nome, emite
 * solicitação de desambiguação com os dados reais para a UI.
 */

import type { Publisher } from '../../../types';
import { normalizeText } from './nlu/l0Grammar';

export interface DisambiguationCandidate {
  id: string;
  label: string;
  detail?: string;
}

export interface PersonResolution {
  resolved: boolean;
  person?: Publisher;
  disambiguationNeeded?: boolean;
  candidates?: DisambiguationCandidate[];
}

export interface WeekResolution {
  resolved: boolean;
  weekId?: string;
  mondayDate?: string;
  label?: string;
  candidates?: DisambiguationCandidate[];
}

/**
 * Resolve nome de publicador contra a lista de publicadores reais
 */
export function resolvePublisher(
  nameQuery: string | undefined,
  allPublishers: Publisher[]
): PersonResolution {
  if (!nameQuery || !nameQuery.trim()) {
    return { resolved: false };
  }

  const queryNorm = normalizeText(nameQuery);

  // 1. Casamento Exato Normalizado
  const exact = allPublishers.filter((p) => normalizeText(p.name) === queryNorm);
  if (exact.length === 1) {
    return { resolved: true, person: exact[0] };
  }

  // 2. Primeiro nome ou token significativo
  const partials = allPublishers.filter((p) => {
    const pNorm = normalizeText(p.name);
    const tokens = pNorm.split(/\s+/);
    return tokens.includes(queryNorm) || pNorm.startsWith(queryNorm);
  });

  if (partials.length === 1) {
    return { resolved: true, person: partials[0] };
  }

  if (partials.length > 1) {
    // Múltiplos candidatos: exige desambiguação
    return {
      resolved: false,
      disambiguationNeeded: true,
      candidates: partials.slice(0, 4).map((p) => ({
        id: p.id,
        label: p.name,
        detail: p.funcao ? `${p.funcao}` : undefined,
      })),
    };
  }

  return { resolved: false };
}

/**
 * Resolve data/semana contra a lista de semanas reais importadas
 */
export function resolveWeek(
  weekQuery: string | undefined,
  availableWeeks: string[]
): WeekResolution {
  if (!availableWeeks.length) return { resolved: false };

  const sorted = [...availableWeeks].sort();
  const today = new Date().toISOString().split('T')[0];

  if (!weekQuery || weekQuery === 'current-week') {
    // Acha a semana corrente (ou mais próxima no futuro)
    const current = sorted.find((w) => w >= today) || sorted[sorted.length - 1];
    return { resolved: true, weekId: current, mondayDate: current };
  }

  if (weekQuery === 'next-week') {
    const currentIndex = sorted.findIndex((w) => w >= today);
    if (currentIndex >= 0 && currentIndex + 1 < sorted.length) {
      const next = sorted[currentIndex + 1];
      return { resolved: true, weekId: next, mondayDate: next };
    }
    const fallback = sorted[sorted.length - 1];
    return { resolved: true, weekId: fallback, mondayDate: fallback };
  }

  if (weekQuery === 'previous-week') {
    const currentIndex = sorted.findIndex((w) => w >= today);
    if (currentIndex > 0) {
      const prev = sorted[currentIndex - 1];
      return { resolved: true, weekId: prev, mondayDate: prev };
    }
    return { resolved: true, weekId: sorted[0], mondayDate: sorted[0] };
  }

  // Dia específico no formato dia-20 ou DD/MM
  if (weekQuery.startsWith('dia-')) {
    const dayNum = parseInt(weekQuery.replace('dia-', ''), 10);
    const match = sorted.find((w) => {
      const day = parseInt(w.split('-')[2] || '0', 10);
      return Math.abs(day - dayNum) <= 3; // Encontra a segunda-feira daquela semana
    });
    if (match) return { resolved: true, weekId: match, mondayDate: match };
  }

  if (weekQuery.includes('/')) {
    const parts = weekQuery.split('/');
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const match = sorted.find((w) => w.includes(`-${month}-`) && w.endsWith(`-${day}`));
    if (match) return { resolved: true, weekId: match, mondayDate: match };
  }

  // Casamento direto se query for o próprio weekId
  if (availableWeeks.includes(weekQuery)) {
    return { resolved: true, weekId: weekQuery, mondayDate: weekQuery };
  }

  return { resolved: false };
}
