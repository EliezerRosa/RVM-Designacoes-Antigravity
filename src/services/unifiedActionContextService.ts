import { supabase } from '../lib/supabase';
import { publisherDirectoryService } from './publisherDirectoryService';
import { createUnifiedActionContextService } from './unifiedActionContextServiceCore';

const _coreService = createUnifiedActionContextService({
    publisherDirectoryReader: publisherDirectoryService,
    partContextReader: {
        async getPartEligibilityRecord(partId: string) {
            const { data, error } = await supabase
                .from('workbook_parts')
                .select('week_id, tipo_parte, modalidade, date, section, funcao, part_title')
                .eq('id', partId)
                .single();

            if (error || !data) {
                return null;
            }

            return {
                weekId: data.week_id,
                tipoParte: data.tipo_parte,
                modalidade: data.modalidade,
                date: data.date,
                section: data.section,
                funcao: data.funcao,
                partTitle: data.part_title,
            };
        },

        async getWeekTitulares(weekId: string) {
            const { data, error } = await supabase
                .from('workbook_parts')
                .select('part_title, resolved_publisher_name')
                .eq('week_id', weekId)
                .eq('funcao', 'Titular');

            if (error || !data) {
                return [];
            }

            return data.map(row => ({
                partTitle: row.part_title,
                resolvedPublisherName: row.resolved_publisher_name,
            }));
        },
    },
});

export const unifiedActionContextService = {
    ..._coreService,

    /**
     * Returns all resolved publisher names already assigned in a given week
     * (excluding the part itself, if partId is provided).
     */
    async getWeekAssignedNames(weekId: string, excludePartId?: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('id, resolved_publisher_name')
            .eq('week_id', weekId)
            .not('resolved_publisher_name', 'is', null);

        if (error || !data) return [];

        return data
            .filter(row => row.id !== excludePartId && row.resolved_publisher_name)
            .map(row => row.resolved_publisher_name as string);
    },
};