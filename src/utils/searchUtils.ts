/**
 * Search Utilities - RVM Designações
 * Funções para normalização e busca fonética em português brasileiro
 */

/**
 * Remove acentos e normaliza texto para busca
 */
export function normalize(text: string): string {
    if (!text) return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Remove diacríticos
        .toLowerCase()
        .trim();
}

/**
 * Soundex adaptado para português brasileiro
 * Agrupa letras com sons similares
 */
export function soundexPt(text: string): string {
    if (!text) return '';

    const normalized = normalize(text);
    if (normalized.length === 0) return '';

    // Mapa de sons similares em português
    const soundMap: Record<string, string> = {
        'b': '1', 'f': '1', 'p': '1', 'v': '1',
        'c': '2', 'g': '2', 'j': '2', 'k': '2', 'q': '2', 's': '2', 'x': '2', 'z': '2',
        'd': '3', 't': '3',
        'l': '4',
        'm': '5', 'n': '5',
        'r': '6',
        // 'a', 'e', 'i', 'o', 'u', 'h', 'w', 'y' são ignorados
    };

    let result = normalized[0].toUpperCase();
    let lastCode = soundMap[normalized[0]] || '';

    for (let i = 1; i < normalized.length && result.length < 4; i++) {
        const char = normalized[i];
        const code = soundMap[char];

        if (code && code !== lastCode) {
            result += code;
            lastCode = code;
        } else if (!code) {
            lastCode = '';  // Reset para vogais/h/w/y
        }
    }

    // Pad com zeros até 4 caracteres
    return result.padEnd(4, '0');
}

/**
 * Verifica se duas strings são foneticamente similares
 */
export function phoneticMatch(query: string, target: string): boolean {
    if (!query || !target) return false;

    const queryCode = soundexPt(query);
    const targetCode = soundexPt(target);

    // Match exato de soundex
    if (queryCode === targetCode) return true;

    // Também verifica se os primeiros 3 caracteres são iguais (mais tolerante)
    return queryCode.substring(0, 3) === targetCode.substring(0, 3);
}

/**
 * Calcula distância de Levenshtein (edição) entre duas strings
 */
export function levenshteinDistance(a: string, b: string): number {
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,  // substituição
                    matrix[i][j - 1] + 1,      // inserção
                    matrix[i - 1][j] + 1       // deleção
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calcula similaridade entre 0 e 1
 */
export function similarity(a: string, b: string): number {
    if (!a || !b) return 0;

    const normA = normalize(a);
    const normB = normalize(b);

    if (normA === normB) return 1;

    const maxLen = Math.max(normA.length, normB.length);
    if (maxLen === 0) return 1;

    const distance = levenshteinDistance(normA, normB);
    return 1 - (distance / maxLen);
}

/**
 * Busca fuzzy em uma lista de strings
 * Retorna itens que correspondem acima do threshold de similaridade
 */
export function fuzzySearch(
    query: string,
    items: string[],
    threshold: number = 0.6
): string[] {
    if (!query || items.length === 0) return [];

    const normalizedQuery = normalize(query);

    const results: { item: string; score: number }[] = [];

    for (const item of items) {
        const normalizedItem = normalize(item);

        // Match exato normalizado
        if (normalizedItem === normalizedQuery) {
            results.push({ item, score: 1.0 });
            continue;
        }

        // Contém a query
        if (normalizedItem.includes(normalizedQuery)) {
            results.push({ item, score: 0.95 });
            continue;
        }

        // Query contém o item
        if (normalizedQuery.includes(normalizedItem)) {
            results.push({ item, score: 0.9 });
            continue;
        }

        // Match fonético
        if (phoneticMatch(query, item)) {
            results.push({ item, score: 0.85 });
            continue;
        }

        // Similaridade de Levenshtein
        const sim = similarity(query, item);
        if (sim >= threshold) {
            results.push({ item, score: sim });
        }
    }

    // Ordena por score decrescente
    return results
        .sort((a, b) => b.score - a.score)
        .map(r => r.item);
}

/**
 * Busca fuzzy em objetos com score detalhado
 */
export function fuzzySearchWithScore<T>(
    query: string,
    items: T[],
    getSearchableText: (item: T) => string,
    threshold: number = 0.6
): Array<{ item: T; score: number }> {
    if (!query || items.length === 0) return [];

    const normalizedQuery = normalize(query);

    const results: Array<{ item: T; score: number }> = [];

    for (const item of items) {
        const text = getSearchableText(item);
        const normalizedText = normalize(text);

        let score = 0;

        // Match exato normalizado
        if (normalizedText === normalizedQuery) {
            score = 1.0;
        }
        // Contém a query
        else if (normalizedText.includes(normalizedQuery)) {
            score = 0.95;
        }
        // Query contém o texto
        else if (normalizedQuery.includes(normalizedText)) {
            score = 0.9;
        }
        // Match fonético
        else if (phoneticMatch(query, text)) {
            score = 0.85;
        }
        // Similaridade de Levenshtein
        else {
            score = similarity(query, text);
        }

        if (score >= threshold) {
            results.push({ item, score });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}

/**
 * Verifica se uma query corresponde a um alvo (simple match)
 * Útil para filtros rápidos
 */
export function matchesSearch(query: string, target: string): boolean {
    if (!query) return true;  // Query vazia corresponde a tudo
    if (!target) return false;

    const normalizedQuery = normalize(query);
    const normalizedTarget = normalize(target);

    // Contém diretamente
    if (normalizedTarget.includes(normalizedQuery)) {
        return true;
    }

    // Match fonético
    if (phoneticMatch(query, target)) {
        return true;
    }

    // Similaridade alta
    if (similarity(query, target) >= 0.7) {
        return true;
    }

    return false;
}
