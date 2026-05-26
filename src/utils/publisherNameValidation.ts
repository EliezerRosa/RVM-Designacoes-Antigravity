/**
 * publisherNameValidation — heurísticas para detectar "poluição do parser"
 * em campos que deveriam conter nome de publicador.
 *
 * Contexto (2026-05-26): durante a importação de apostila, o parser pode
 * acidentalmente gravar no campo de publicador o título da parte seguinte
 * ("3. Leitura da Bíblia"), um range de horário ("19-30"), número de
 * cântico, etc. Essas strings nunca casam com nenhum Publisher cadastrado
 * e poluem auditoria/relatórios.
 *
 * Estas funções são deterministicamente conservadoras: só sinalizam o que
 * é OBVIAMENTE não-nome. Nomes legítimos com hífen ("Maria-Clara") ou
 * acento não disparam falso positivo.
 */

export interface InvalidNameReason {
    code: 'starts_with_digit' | 'time_range' | 'too_short' | 'contains_part_keyword' | 'mostly_punctuation';
    description: string;
}

const PART_KEYWORDS = [
    'leitura da bíblia',
    'leitura da biblia',
    'joias espirituais',
    'tesouros da palavra',
    'cântico',
    'cantico',
    'comentários iniciais',
    'comentarios iniciais',
    'comentários finais',
    'comentarios finais',
    'estudo bíblico',
    'estudo biblico',
    'necessidades locais',
    'elogios e conselhos',
    'oração final',
    'oracao final',
    'iniciando conversas',
    'cultivando o interesse',
    'fazendo discípulos',
    'fazendo discipulos',
];

/**
 * Retorna a razão pela qual o nome parece inválido, ou null se parece ok.
 * NÃO faz lookup no cadastro de publishers — apenas heurística sintática.
 */
export function validatePublisherName(rawName: string | null | undefined): InvalidNameReason | null {
    if (!rawName) return null;
    const name = rawName.trim();
    if (!name) return null;

    // 1) Começa com dígito + ponto/parêntese (típico: "3. Leitura da Bíblia", "4)")
    if (/^\s*\d+\s*[\.\)]/.test(name)) {
        return { code: 'starts_with_digit', description: 'Começa com numeração de item (ex.: "3.")' };
    }

    // 2) Range de horário ou apenas dígitos/dois-pontos/hífen (ex.: "19-30", "19:30", "20:15-21:00")
    if (/^[\d:\-\s]+$/.test(name)) {
        return { code: 'time_range', description: 'Parece range de horário/dígitos apenas' };
    }

    // 3) Muito curto para ser nome (1-2 chars)
    if (name.length < 3) {
        return { code: 'too_short', description: 'Texto muito curto para ser nome' };
    }

    // 4) Contém palavra-chave de parte da reunião (case-insensitive)
    const lower = name.toLowerCase();
    for (const kw of PART_KEYWORDS) {
        if (lower.includes(kw)) {
            return { code: 'contains_part_keyword', description: `Contém termo de parte da reunião: "${kw}"` };
        }
    }

    // 5) Maioria pontuação/símbolos
    const letterCount = (name.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    if (letterCount < name.length * 0.5) {
        return { code: 'mostly_punctuation', description: 'Mais símbolos/dígitos do que letras' };
    }

    return null;
}

/**
 * Atalho: true se o nome dispara alguma heurística de invalidez.
 */
export function isLikelyInvalidPublisherName(rawName: string | null | undefined): boolean {
    return validatePublisherName(rawName) !== null;
}
