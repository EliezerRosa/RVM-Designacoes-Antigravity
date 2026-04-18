import { api } from './api';
import { supabase } from '../lib/supabase';
import { workbookService } from './workbookService';
import { createPublisherMutationService } from './publisherMutationServiceCore';
export type { SavePublisherResult, PublisherMutationPreview } from './publisherMutationServiceCore';

interface CountQueryResult {
    count: number | null;
    error: unknown;
}

async function defaultCountPublisherNameImpacts(oldName: string): Promise<{ resolvedParts: number; rawParts: number }> {
    const [resolvedResult, rawResult] = await Promise.all([
        supabase
            .from('workbook_parts')
            .select('id', { count: 'exact', head: true })
            .eq('resolved_publisher_name', oldName),
        supabase
            .from('workbook_parts')
            .select('id', { count: 'exact', head: true })
            .eq('raw_publisher_name', oldName)
    ]);

    const { count: resolvedCount, error: resolvedError } = resolvedResult as CountQueryResult;
    const { count: rawCount, error: rawError } = rawResult as CountQueryResult;

    if (resolvedError) throw resolvedError;
    if (rawError) throw rawError;

    return {
        resolvedParts: resolvedCount || 0,
        rawParts: rawCount || 0,
    };
}

export const publisherMutationService = createPublisherMutationService({
    apiClient: api,
    workbookClient: workbookService,
    countPublisherNameImpacts: defaultCountPublisherNameImpacts,
});