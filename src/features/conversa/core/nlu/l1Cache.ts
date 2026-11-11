/**
 * L1 Cache — Cache de Intenções Semânticas (Memória / SessionStorage)
 *
 * Garante que frases já resolvidas ou recorrentes sejam resolvidas
 * instantaneamente sem novo processamento ou chamada de rede.
 */

import type { L0ParseResult } from './l0Grammar';
import { normalizeText } from './l0Grammar';

const MEMORY_CACHE = new Map<string, L0ParseResult>();
const CACHE_PREFIX = 'rvm_conversa_l1:';

function buildCacheKey(text: string, contextClass: string = 'default'): string {
  const norm = normalizeText(text);
  return `${contextClass}:${norm}`;
}

export function getCachedIntent(text: string, contextClass: string = 'default'): L0ParseResult | null {
  const key = buildCacheKey(text, contextClass);

  // 1. Memória rápida
  const inMem = MEMORY_CACHE.get(key);
  if (inMem) return inMem;

  // 2. SessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(CACHE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as L0ParseResult;
        MEMORY_CACHE.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // SessionStorage inacessível ou quota cheia; segue sem erro
  }

  return null;
}

export function setCachedIntent(text: string, result: L0ParseResult, contextClass: string = 'default'): void {
  if (!result.intentId || result.confidence < 0.8) return;

  const key = buildCacheKey(text, contextClass);
  MEMORY_CACHE.set(key, result);

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(result));
    }
  } catch {
    // Silencia erros de storage
  }
}

export function clearL1Cache(): void {
  MEMORY_CACHE.clear();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    }
  } catch {
    // Silencia
  }
}
