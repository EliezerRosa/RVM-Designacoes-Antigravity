/**
 * AV Schedule Service - Consulta a escala de Áudio/Vídeo e Indicadores do Hourglass
 * 
 * Permite exibir alertas contextuais (ex.: 🎧 Operador de Áudio) no seletor de publicadores
 * prevenindo dupla escala na mesma reunião sem bloquear a flexibilidade do operador humano.
 */
import { supabase } from '../lib/supabase';

export interface AvAssignment {
    id: number;
    hg_id: number;
    publisher_id?: string;
    publisher_name?: string;
    date: string; // YYYY-MM-DD
    type: string;
    label: string;
    slot: number;
}

interface AvScheduleCache {
    ts: number;
    assignments: AvAssignment[];
}

let _cache: AvScheduleCache | null = null;
const CACHE_TTL = 60000; // 60 segundos

export async function loadAvSchedule(forceRefresh = false): Promise<AvAssignment[]> {
    if (!forceRefresh && _cache && Date.now() - _cache.ts < CACHE_TTL) {
        return _cache.assignments;
    }

    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'hg_av_schedule')
            .maybeSingle();

        if (error || !data?.value) {
            return [];
        }

        const assignments: AvAssignment[] = Array.isArray(data.value.assignments)
            ? data.value.assignments
            : [];

        _cache = { ts: Date.now(), assignments };
        return assignments;
    } catch {
        return [];
    }
}

export function findAvAssignmentForPublisher(
    assignments: AvAssignment[],
    publisherId: string,
    publisherName?: string,
    weekId?: string,
    date?: string
): AvAssignment | undefined {
    if (!assignments || assignments.length === 0) return undefined;

    return assignments.find(a => {
        const matchPub = (publisherId && a.publisher_id === publisherId) ||
                         (publisherName && a.publisher_name === publisherName);
        if (!matchPub) return false;

        // Casa por semana ou por data exata
        const matchDate = (weekId && a.date === weekId) || (date && a.date === date);
        return Boolean(matchDate);
    });
}
