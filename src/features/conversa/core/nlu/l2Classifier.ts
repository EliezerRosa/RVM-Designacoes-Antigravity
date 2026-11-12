/**
 * L2 Classifier — Classificador Semântico com Validação Rígida de Schema
 *
 * Tenta classificar via endpoint serverless (/api/conversa-nlu) se disponível.
 * Se offline, timeout ou erro 5xx/429, recorre transparentemente ao L0 determinístico.
 * Proibido inventar intentId fora do catálogo fechado.
 */

import { CONVERSA_INTENTS, type ConversaIntentId, getIntentContract } from '../intentCatalog';
import type { L0ParseResult, ParsedSlots } from './l0Grammar';
import { parseL0Grammar } from './l0Grammar';
import { getCachedIntent, setCachedIntent } from './l1Cache';

export interface NLUResolution {
  intentId: ConversaIntentId | null;
  slots: ParsedSlots;
  confidence: number;
  layer: 'l0-grammar' | 'l1-cache' | 'l2-classifier' | 'fallback';
  rawText: string;
}

export async function resolveIntent(
  text: string,
  contextClass: string = 'default'
): Promise<NLUResolution> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      intentId: null,
      slots: {},
      confidence: 0,
      layer: 'fallback',
      rawText: text,
    };
  }

  // 1. Camada L1 — Cache
  const cached = getCachedIntent(trimmed, contextClass);
  if (cached && cached.intentId) {
    return {
      intentId: cached.intentId,
      slots: cached.slots,
      confidence: cached.confidence,
      layer: 'l1-cache',
      rawText: trimmed,
    };
  }

  // 2. Camada L0 — Gramática determinística pt-BR
  const l0 = parseL0Grammar(trimmed);
  if (l0.intentId && l0.confidence >= 0.85) {
    setCachedIntent(trimmed, l0, contextClass);
    return {
      intentId: l0.intentId,
      slots: l0.slots,
      confidence: l0.confidence,
      layer: 'l0-grammar',
      rawText: trimmed,
    };
  }

  // 3. Camada L2 — Chamada ao endpoint semântico (se L0 foi inconclusivo)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s max

    const response = await fetch('/api/conversa-nlu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utterance: trimmed,
        text: trimmed,
        contextClass,
        allowedIntents: CONVERSA_INTENTS.map((i) => i.intentId),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.ok) {
      const data = await response.json();
      const contract =
        data?.intentId && data.intentId !== 'fallback.unknown'
          ? getIntentContract(data.intentId)
          : undefined;
      if (contract) {
        const minThreshold = contract.risk === 'high' || contract.category === 'action' ? 0.9 : 0.75;
        if (typeof data.confidence === 'number' && data.confidence >= minThreshold) {
          const edgeSlots = (data.slots && typeof data.slots === 'object' ? data.slots : {}) as Record<string, unknown>;
          const cleanSlot = (val: unknown): string | undefined => {
            if (typeof val !== 'string') return undefined;
            const s = val.trim();
            return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' ? s : undefined;
          };
          const personNameSlot = cleanSlot(edgeSlots.personName) || cleanSlot(edgeSlots.publisherName);
          const targetDateSlot = cleanSlot(edgeSlots.targetDate);
          const weekIdSlot = cleanSlot(edgeSlots.weekId) || targetDateSlot;
          const partTypeSlot = cleanSlot(edgeSlots.partTitle) || cleanSlot(edgeSlots.partType);
          const ruleIdSlot = cleanSlot(edgeSlots.ruleId);

          const mappedSlots: ParsedSlots = {
            ...l0.slots,
            ...(personNameSlot ? { personName: personNameSlot } : {}),
            ...(targetDateSlot ? { targetDate: targetDateSlot } : {}),
            ...(weekIdSlot ? { weekId: weekIdSlot } : {}),
            ...(partTypeSlot ? { partType: partTypeSlot } : {}),
            ...(ruleIdSlot ? { ruleId: ruleIdSlot } : {}),
          };

          const l2Result: L0ParseResult = {
            intentId: contract.intentId as ConversaIntentId,
            slots: mappedSlots,
            confidence: data.confidence,
            resolvedBy: 'l0-grammar',
            rawText: trimmed,
          };
          setCachedIntent(trimmed, l2Result, contextClass);
          return {
            intentId: contract.intentId as ConversaIntentId,
            slots: l2Result.slots,
            confidence: data.confidence,
            layer: 'l2-classifier',
            rawText: trimmed,
          };
        }
      }
    }
  } catch {
    // Falha de rede, offline ou endpoint ausente: degradação suave para L0
  }

  // Se L0 encontrou algo com confiança moderada
  if (l0.intentId) {
    return {
      intentId: l0.intentId,
      slots: l0.slots,
      confidence: l0.confidence,
      layer: 'l0-grammar',
      rawText: trimmed,
    };
  }

  // Fallback final: não compreendido categoricamente
  return {
    intentId: null,
    slots: l0.slots,
    confidence: l0.confidence,
    layer: 'fallback',
    rawText: trimmed,
  };
}

