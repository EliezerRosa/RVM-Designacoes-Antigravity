import { store } from '../store.js';
import { ResolvedPerson } from '../types.js';

export interface KnownPublisher {
  hg_id: number;
  name: string;
}

export class NameResolver {
  private knownPublishers: KnownPublisher[] = [];

  setKnownPublishers(publishers: KnownPublisher[]) {
    this.knownPublishers = publishers;
  }

  resolve(rawName: string, role?: string): ResolvedPerson {
    const rawClean = (rawName || '').trim().replace(/\s+/g, ' ');
    if (!rawClean) {
      return {
        rawName: '',
        canonicalName: '',
        hg_id: null,
        confidence: 'unresolved'
      };
    }

    const key = rawClean.toUpperCase();
    const aliases = store.getAliases();

    // 1. Apelido configurado (com suporte a papel específico, ex: wm_chairman vs wm_reader)
    if (aliases[key]) {
      const alias = aliases[key];
      if (role && alias.byRole && alias.byRole[role]) {
        const r = alias.byRole[role];
        return {
          rawName: rawClean,
          canonicalName: r.canonicalName,
          hg_id: r.hg_id,
          confidence: 'alias'
        };
      }
      return {
        rawName: rawClean,
        canonicalName: alias.canonicalName,
        hg_id: alias.hg_id,
        confidence: 'alias'
      };
    }

    // 2. Casamento exato com lista de publicadores conhecidos
    const exactMatch = this.knownPublishers.find(p => p.name.toUpperCase() === key);
    if (exactMatch) {
      return {
        rawName: rawClean,
        canonicalName: exactMatch.name,
        hg_id: exactMatch.hg_id,
        confidence: 'exact'
      };
    }

    // 3. Casamento por prefixo / primeiro e último nome / abreviações
    const candidates = this.findCandidates(rawClean);

    if (candidates.length === 1) {
      return {
        rawName: rawClean,
        canonicalName: candidates[0].name,
        hg_id: candidates[0].hg_id,
        confidence: 'fuzzy'
      };
    }

    if (candidates.length > 1) {
      return {
        rawName: rawClean,
        canonicalName: rawClean,
        hg_id: null,
        confidence: 'unresolved',
        ambiguous: true,
        candidates
      };
    }

    // Não encontrado
    return {
      rawName: rawClean,
      canonicalName: rawClean,
      hg_id: null,
      confidence: 'unresolved'
    };
  }

  private findCandidates(rawName: string): KnownPublisher[] {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const search = norm(rawName);
    const searchParts = search.split(' ');

    return this.knownPublishers.filter(p => {
      const pNorm = norm(p.name);
      const pParts = pNorm.split(' ');

      // Prefixo idêntico
      if (pNorm.startsWith(search) || search.startsWith(pNorm)) return true;

      // Se temos nome e sobrenome
      if (searchParts.length >= 2) {
        return searchParts.every(part => pNorm.includes(part));
      }

      // Se é palavra única (ex: "Renato", "Edmardo")
      if (pParts[0] === search || pParts[pParts.length - 1] === search) {
        return true;
      }

      return false;
    });
  }
}

export const nameResolver = new NameResolver();
