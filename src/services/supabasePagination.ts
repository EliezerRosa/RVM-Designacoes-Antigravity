/**
 * Supabase Pagination Helper
 * Supera o limite de 1000 rows do Supabase/PostgREST
 * busca todos os registros em lotes automáticos
 */

import { supabase } from '../lib/supabase';

const PAGE_SIZE = 1000;

/**
 * Busca todos os registros de uma tabela usando paginação automática
 * @param table Nome da tabela
 * @param buildQuery Função que recebe o query builder e aplica filtros/ordenação
 * @returns Array com todos os registros
 */
export async function fetchAllRows<T extends Record<string, unknown>>(
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildQuery: (query: any) => any
): Promise<T[]> {
    const allRecords: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        // Cria query base e aplica filtros
        const baseQuery = supabase.from(table).select('*');
        const filteredQuery = buildQuery(baseQuery);

        // Aplica range para paginação, com retry em AbortError transitório
        // (comum ao acordar de hibernação, quando o refresh do token JWT
        // aborta requisições em voo: "signal is aborted without reason").
        let data: unknown[] | null = null;
        let error: { message?: string; name?: string; code?: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await filteredQuery.range(offset, offset + PAGE_SIZE - 1);
            data = res.data;
            error = res.error;
            const isAbort = error && (error.name === 'AbortError' || /aborted/i.test(error.message ?? ''));
            if (!isAbort) break;
            console.warn(`[Pagination] AbortError em ${table} (tentativa ${attempt + 1}/3), retry...`);
            await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
        }

        if (error) {
            console.error(`[Pagination] Erro ao buscar ${table}:`, error.message);
            break;
        }

        if (data && data.length > 0) {
            allRecords.push(...(data as T[]));

            if (data.length < PAGE_SIZE) {
                hasMore = false; // Última página (incompleta)
            } else {
                offset += PAGE_SIZE;
            }
        } else {
            hasMore = false;
        }
    }

    return allRecords;
}

/**
 * Versão simplificada para queries sem filtros customizados
 */
export async function fetchAllFromTable<T extends Record<string, unknown>>(
    table: string,
    orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
    return fetchAllRows<T>(table, (query) => {
        if (orderBy) {
            return query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        }
        return query;
    });
}
