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

    console.log(`[Pagination] Iniciando busca paginada em ${table}...`);

    while (hasMore) {
        // Cria query base e aplica filtros
        const baseQuery = supabase.from(table).select('*');
        const filteredQuery = buildQuery(baseQuery);

        // Aplica range para paginação
        const { data, error } = await filteredQuery.range(offset, offset + PAGE_SIZE - 1);

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
                console.log(`[Pagination] ${table}: ${allRecords.length} registros carregados, buscando mais...`);
            }
        } else {
            hasMore = false;
        }
    }

    console.log(`[Pagination] ${table}: Total de ${allRecords.length} registros`);
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
