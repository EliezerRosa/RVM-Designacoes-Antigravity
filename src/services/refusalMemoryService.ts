import { supabase } from '../lib/supabase';

// Memória de Recusa (M-12): quem recusou numa semana fica inelegível para QUALQUER parte dessa semana.
// Fonte: refusal_logs (portal, Z-API e agente gravam ali). Cache curto para não martelar o banco em loops do motor.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { names: string[]; ts: number }>();

export async function loadRefusedNamesByWeek(weekIds: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const unique = [...new Set(weekIds.filter(Boolean))];
    const toFetch: string[] = [];
    const now = Date.now();

    for (const weekId of unique) {
        const hit = cache.get(weekId);
        if (hit && now - hit.ts < CACHE_TTL_MS) result[weekId] = hit.names;
        else toFetch.push(weekId);
    }

    if (toFetch.length > 0) {
        const { data, error } = await supabase
            .from('refusal_logs')
            .select('week_id, publisher_name')
            .in('week_id', toFetch);

        if (error) {
            console.error('[refusalMemoryService] Erro ao carregar refusal_logs:', error);
        }

        for (const weekId of toFetch) {
            const names = [...new Set((data || [])
                .filter(row => row.week_id === weekId)
                .map(row => String(row.publisher_name || '').trim())
                .filter(Boolean))];
            cache.set(weekId, { names, ts: now });
            result[weekId] = names;
        }
    }

    return result;
}

export async function loadRefusedNamesForWeek(weekId: string): Promise<string[]> {
    const byWeek = await loadRefusedNamesByWeek([weekId]);
    return byWeek[weekId] || [];
}

export async function loadLastRefusedNameForPart(partId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('refusal_logs')
        .select('publisher_name, created_at')
        .eq('part_id', partId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('[refusalMemoryService] Erro ao buscar última recusa da parte:', error);
        return null;
    }
    const name = String(data?.publisher_name || '').trim();
    return name || null;
}

export function invalidateRefusalMemoryCache(): void {
    cache.clear();
}
