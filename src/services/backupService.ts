/**
 * Backup Service - RVM Designações
 * Handles export and import of all application data
 * Supports both JSON and Excel formats
 */

import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import type { Publisher, WorkbookPart } from '../types';

// Types
export interface BackupMetadata {
    version: string;
    exportDate: string;
    appVersion: string;
}

export interface BackupData {
    metadata: BackupMetadata;
    tables: {
        publishers: { count: number; data: Publisher[] };
        workbook_parts: { count: number; data: WorkbookPart[] };
        workbook_batches: { count: number; data: any[] };
        special_events: { count: number; data: any[] };
        extraction_history: { count: number; data: any[] };
        local_needs_preassignments: { count: number; data: any[] };
    };
}

export interface ImportResult {
    success: boolean;
    message: string;
    counts: {
        publishers: number;
        workbook_parts: number;
        workbook_batches: number;
        special_events: number;
        extraction_history: number;
        local_needs_preassignments: number;
    };
    errors?: string[];
}

// Tipo para conflitos de duplicatas detectados antes do restore
export interface DuplicateConflict {
    backupName: string;
    backupId: string;
    existingName: string;
    existingId: string;
    similarity: number;  // 0-100 (100 = idêntico)
}

// Tipo para histórico de operações de backup
export interface BackupHistoryEntry {
    id: number;
    operation: 'export' | 'import';
    backup_date: string | null;
    origin: string;  // 'json', 'excel', nome do arquivo
    counts: {
        publishers?: number;
        workbook_parts?: number;
        workbook_batches?: number;
        special_events?: number;
    };
    status: 'success' | 'error' | 'partial';
    error_message: string | null;
    created_at: string;
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Fetch all data from Supabase for backup
 */
async function fetchAllData(): Promise<BackupData> {
    // Fetch publishers
    const { data: publishers, error: pubError } = await supabase
        .from('publishers')
        .select('*')
        .range(0, 9999);
    if (pubError) throw new Error(`Erro ao buscar publishers: ${pubError.message}`);

    // Fetch workbook_batches
    const { data: workbookBatches, error: wbError } = await supabase
        .from('workbook_batches')
        .select('*')
        .range(0, 9999);
    // Tabela pode não existir ainda, ignorar erro
    const safeWorkbookBatches = wbError ? [] : (workbookBatches || []);

    // Fetch workbook_parts
    const { data: workbookParts, error: wpError } = await supabase
        .from('workbook_parts')
        .select('*')
        .range(0, 9999);
    if (wpError) throw new Error(`Erro ao buscar workbook_parts: ${wpError.message}`);

    // Fetch special_events
    const { data: specialEvents, error: seError } = await supabase
        .from('special_events')
        .select('*')
        .range(0, 9999);
    // Tabela pode não existir ainda, ignorar erro
    const safeSpecialEvents = seError ? [] : (specialEvents || []);

    // Fetch extraction_history
    const { data: extractionHistory, error: ehError } = await supabase
        .from('extraction_history')
        .select('*')
        .range(0, 9999);
    // Tabela pode não existir ainda, ignorar erro
    const safeExtractionHistory = ehError ? [] : (extractionHistory || []);

    // Fetch local_needs_preassignments
    const { data: localNeeds, error: lnError } = await supabase
        .from('local_needs_preassignments')
        .select('*')
        .range(0, 9999);
    // Tabela pode não existir ainda, ignorar erro
    const safeLocalNeeds = lnError ? [] : (localNeeds || []);

    return {
        metadata: {
            version: '1.0',
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0'
        },
        tables: {
            publishers: { count: publishers?.length || 0, data: publishers || [] },
            workbook_batches: { count: safeWorkbookBatches.length, data: safeWorkbookBatches },
            workbook_parts: { count: workbookParts?.length || 0, data: workbookParts || [] },
            special_events: { count: safeSpecialEvents.length, data: safeSpecialEvents },
            extraction_history: { count: safeExtractionHistory.length, data: safeExtractionHistory },
            local_needs_preassignments: { count: safeLocalNeeds.length, data: safeLocalNeeds }
        }
    };
}

/**
 * Export data to JSON string
 */
export async function exportToJSON(): Promise<string> {
    const data = await fetchAllData();
    return JSON.stringify(data, null, 2);
}

/**
 * Export data to Excel workbook
 */
export async function exportToExcel(): Promise<Blob> {
    const data = await fetchAllData();

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Publishers - serializar campo 'data' como JSON string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publishersForExcel = (data.tables.publishers.data as any[]).map(pub => ({
        id: pub.id,
        data: JSON.stringify(pub.data),  // Serializa JSONB como string
        created_at: pub.created_at
    }));
    const publishersSheet = XLSX.utils.json_to_sheet(publishersForExcel);
    XLSX.utils.book_append_sheet(workbook, publishersSheet, 'publishers');

    // Sheet 2: Workbook Batches
    const batchesSheet = XLSX.utils.json_to_sheet(data.tables.workbook_batches.data);
    XLSX.utils.book_append_sheet(workbook, batchesSheet, 'workbook_batches');

    // Sheet 3: Workbook Parts
    const partsSheet = XLSX.utils.json_to_sheet(data.tables.workbook_parts.data);
    XLSX.utils.book_append_sheet(workbook, partsSheet, 'workbook_parts');

    // Sheet 4: Special Events - Serializar objetos complexos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventsForExcel = (data.tables.special_events.data as any[]).map(evt => ({
        ...evt,
        configuration: evt.configuration ? JSON.stringify(evt.configuration) : null,
        details: evt.details ? JSON.stringify(evt.details) : null
    }));
    const eventsSheet = XLSX.utils.json_to_sheet(eventsForExcel);
    XLSX.utils.book_append_sheet(workbook, eventsSheet, 'special_events');

    // Sheet 4: Extraction History
    const historySheet = XLSX.utils.json_to_sheet(data.tables.extraction_history.data);
    XLSX.utils.book_append_sheet(workbook, historySheet, 'extraction_history');

    // Sheet 5: Local Needs Preassignments
    const localNeedsSheet = XLSX.utils.json_to_sheet(data.tables.local_needs_preassignments.data);
    XLSX.utils.book_append_sheet(workbook, localNeedsSheet, 'local_needs_preassignments');

    // Sheet 6: Metadata
    const metadataSheet = XLSX.utils.json_to_sheet([{
        version: data.metadata.version,
        exportDate: data.metadata.exportDate,
        appVersion: data.metadata.appVersion,
        publishers_count: data.tables.publishers.count,
        workbook_batches_count: data.tables.workbook_batches.count,
        workbook_parts_count: data.tables.workbook_parts.count,
        special_events_count: data.tables.special_events.count,
        extraction_history_count: data.tables.extraction_history.count,
        local_needs_preassignments_count: data.tables.local_needs_preassignments.count
    }]);
    XLSX.utils.book_append_sheet(workbook, metadataSheet, '_metadata');

    // Generate blob
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export all data - downloads both JSON and Excel files
 */
export async function exportAll(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const data = await fetchAllData();

    // Export JSON
    const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(jsonBlob, `backup_rvm_${timestamp}.json`);

    // Export Excel
    const excelBlob = await exportToExcel();
    downloadBlob(excelBlob, `backup_rvm_${timestamp}.xlsx`);

    // Save last export date in localStorage
    localStorage.setItem('lastBackupDate', new Date().toISOString());

    // Log to history
    await logBackupOperation('export', 'json+excel', {
        publishers: data.tables.publishers.count,
        workbook_parts: data.tables.workbook_parts.count,
        workbook_batches: data.tables.workbook_batches.count,
        special_events: data.tables.special_events.count
    });
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =============================================================================
// IMPORT FUNCTIONS
// =============================================================================

/**
 * Parse JSON backup file
 */
export function parseJSONBackup(jsonString: string): BackupData {
    const data = JSON.parse(jsonString) as BackupData;

    // Validate structure
    if (!data.metadata || !data.tables) {
        throw new Error('Formato de backup inválido: estrutura incorreta');
    }
    if (!data.tables.publishers || !data.tables.workbook_parts) {
        throw new Error('Formato de backup inválido: tabelas obrigatórias ausentes');
    }

    return data;
}

/**
 * Parse Excel backup file
 */
export async function parseExcelBackup(file: File): Promise<BackupData> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                // Read sheets
                const rawPublishers = XLSX.utils.sheet_to_json(workbook.Sheets['publishers']) as Array<{ id: string, data: string, created_at?: string }>;
                // Parse JSON string de volta para objeto
                const publishers = rawPublishers.map(row => ({
                    id: row.id,
                    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
                    created_at: row.created_at
                })) as unknown as Publisher[];
                const workbookParts = XLSX.utils.sheet_to_json(workbook.Sheets['workbook_parts']) as WorkbookPart[];
                const workbookBatches = workbook.Sheets['workbook_batches']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['workbook_batches'])
                    : [];

                const rawSpecialEvents = workbook.Sheets['special_events']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['special_events'])
                    : [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const specialEvents = rawSpecialEvents.map((evt: any) => ({
                    ...evt,
                    configuration: evt.configuration && typeof evt.configuration === 'string'
                        ? JSON.parse(evt.configuration) : evt.configuration,
                    details: evt.details && typeof evt.details === 'string'
                        ? JSON.parse(evt.details) : evt.details,
                }));

                const extractionHistory = workbook.Sheets['extraction_history']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['extraction_history'])
                    : [];
                const localNeeds = workbook.Sheets['local_needs_preassignments']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['local_needs_preassignments'])
                    : [];
                const metadata = workbook.Sheets['_metadata']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['_metadata'])[0] as any
                    : { version: '1.0', exportDate: 'unknown', appVersion: 'unknown' };

                resolve({
                    metadata: {
                        version: metadata.version || '1.0',
                        exportDate: metadata.exportDate || 'unknown',
                        appVersion: metadata.appVersion || 'unknown'
                    },
                    tables: {
                        publishers: { count: publishers.length, data: publishers },
                        workbook_batches: { count: workbookBatches.length, data: workbookBatches },
                        workbook_parts: { count: workbookParts.length, data: workbookParts },
                        special_events: { count: specialEvents.length, data: specialEvents },
                        extraction_history: { count: extractionHistory.length, data: extractionHistory },
                        local_needs_preassignments: { count: localNeeds.length, data: localNeeds }
                    }
                });
            } catch (error) {
                reject(new Error(`Erro ao ler arquivo Excel: ${error}`));
            }
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Import data from backup (replace mode - deletes existing data first)
 */
export async function importBackup(data: BackupData, mode: 'replace' | 'merge' = 'replace'): Promise<ImportResult> {
    const errors: string[] = [];
    const counts = {
        publishers: 0,
        workbook_parts: 0,
        workbook_batches: 0,
        special_events: 0,
        extraction_history: 0,
        local_needs_preassignments: 0
    };

    try {
        // In replace mode, delete existing data first
        // DELETE ORDER: Parts -> Batches (FK)
        if (mode === 'replace') {
            await supabase.from('workbook_parts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('workbook_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete batches after parts
            await supabase.from('publishers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('special_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('extraction_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('local_needs_preassignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }

        // Import publishers
        // Estrutura da tabela: id (text), data (jsonb) - igual ao api.ts
        if (data.tables.publishers?.data?.length > 0) {
            // Converter para estrutura correta: {id, data: Publisher}
            const dbRows = data.tables.publishers.data.map((pub: Publisher & { data?: Record<string, unknown> }) => {
                // Se já veio do banco com estrutura {id, data}, usar data diretamente
                if (pub.data && typeof pub.data === 'object' && 'name' in pub.data) {
                    return { id: pub.id, data: pub.data };
                }
                // Se veio como flat (Publisher direto), encapsular em data
                return { id: pub.id, data: pub };
            });

            const { error } = await supabase
                .from('publishers')
                .upsert(dbRows, { onConflict: 'id' });
            if (error) {
                errors.push(`Publishers: ${error.message}`);
            } else {
                counts.publishers = data.tables.publishers.data.length;
            }
        }

        // Import workbook_batches (INSERT ORDER: Batches -> Parts)
        if (data.tables.workbook_batches?.data?.length > 0) {
            const { error } = await supabase
                .from('workbook_batches')
                .upsert(data.tables.workbook_batches.data, { onConflict: 'id' });
            if (error) {
                errors.push(`Workbook Batches: ${error.message}`);
            } else {
                counts.workbook_batches = data.tables.workbook_batches.data.length;
            }
        }

        // Import workbook_parts
        if (data.tables.workbook_parts?.data?.length > 0) {
            // Importar em lotes de 500 para evitar limites
            const batchSize = 500;
            for (let i = 0; i < data.tables.workbook_parts.data.length; i += batchSize) {
                const batch = data.tables.workbook_parts.data.slice(i, i + batchSize);
                const { error } = await supabase
                    .from('workbook_parts')
                    .upsert(batch, { onConflict: 'id' });
                if (error) {
                    errors.push(`Workbook Parts (batch ${i}): ${error.message}`);
                } else {
                    counts.workbook_parts += batch.length;
                }
            }
        }

        // Import special_events
        if (data.tables.special_events?.data?.length > 0) {
            const { error } = await supabase
                .from('special_events')
                .upsert(data.tables.special_events.data, { onConflict: 'id' });
            if (error) {
                errors.push(`Special Events: ${error.message}`);
            } else {
                counts.special_events = data.tables.special_events.data.length;
            }
        }

        // Import extraction_history
        if (data.tables.extraction_history?.data?.length > 0) {
            const { error } = await supabase
                .from('extraction_history')
                .upsert(data.tables.extraction_history.data, { onConflict: 'id' });
            if (error) {
                errors.push(`Extraction History: ${error.message}`);
            } else {
                counts.extraction_history = data.tables.extraction_history.data.length;
            }
        }

        // Import local_needs_preassignments
        if (data.tables.local_needs_preassignments?.data?.length > 0) {
            const { error } = await supabase
                .from('local_needs_preassignments')
                .upsert(data.tables.local_needs_preassignments.data, { onConflict: 'id' });
            if (error) {
                errors.push(`Local Needs Preassignments: ${error.message}`);
            } else {
                counts.local_needs_preassignments = data.tables.local_needs_preassignments.data.length;
            }
        }

        const result = {
            success: errors.length === 0,
            message: errors.length === 0
                ? `Importação concluída com sucesso!`
                : `Importação concluída com ${errors.length} erro(s)`,
            counts,
            errors: errors.length > 0 ? errors : undefined
        };

        // Log to history
        await logBackupOperation(
            'import',
            mode,
            counts,
            result.success ? 'success' : 'partial',
            result.errors?.join('; '),
            data.metadata.exportDate
        );

        return result;

    } catch (error) {
        // Log error to history
        await logBackupOperation(
            'import',
            mode,
            counts,
            'error',
            error instanceof Error ? error.message : String(error),
            data.metadata.exportDate
        );

        return {
            success: false,
            message: `Erro na importação: ${error instanceof Error ? error.message : String(error)}`,
            counts,
            errors: [String(error)]
        };
    }
}

/**
 * Get preview of backup data (counts only)
 */
export function getBackupPreview(data: BackupData): { table: string; count: number }[] {
    return [
        { table: 'Publicadores', count: data.tables.publishers?.count ?? 0 },
        { table: 'Lotes (Batches)', count: data.tables.workbook_batches?.count ?? 0 },
        { table: 'Partes da Apostila', count: data.tables.workbook_parts?.count ?? 0 },
        { table: 'Eventos Especiais', count: data.tables.special_events?.count ?? 0 },
        { table: 'Histórico de Extração', count: data.tables.extraction_history?.count ?? 0 },
        { table: 'Fila de Necessidades', count: data.tables.local_needs_preassignments?.count ?? 0 }
    ];
}

/**
 * Get last backup date from localStorage
 */
export function getLastBackupDate(): string | null {
    return localStorage.getItem('lastBackupDate');
}

// =============================================================================
// DUPLICATE DETECTION FUNCTIONS
// =============================================================================

/**
 * Levenshtein distance algorithm for name similarity
 */
function levenshtein(a: string, b: string): number {
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
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage between two names
 */
function calculateSimilarity(name1: string, name2: string): number {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();

    if (n1 === n2) return 100;

    const distance = levenshtein(n1, n2);
    const maxLength = Math.max(n1.length, n2.length);

    if (maxLength === 0) return 100;

    return Math.round((1 - distance / maxLength) * 100);
}

/**
 * Extract publisher name from backup data (handles both flat and nested structures)
 */
function getPublisherName(pub: any): string {
    if (pub.data && typeof pub.data === 'object' && pub.data.name) {
        return pub.data.name;
    }
    return pub.name || '';
}

/**
 * Detect potential duplicates between backup data and existing database
 * Returns conflicts where similarity is >= 85%
 */
export async function detectDuplicates(backupData: BackupData): Promise<DuplicateConflict[]> {
    const conflicts: DuplicateConflict[] = [];
    const SIMILARITY_THRESHOLD = 85; // 85% or higher is considered a potential duplicate

    // Fetch existing publishers from database
    const { data: existingRows, error } = await supabase
        .from('publishers')
        .select('id, data')
        .range(0, 9999);

    if (error || !existingRows) {
        console.warn('[detectDuplicates] Could not fetch existing publishers:', error);
        return [];
    }

    // Create map of existing publishers: name -> {id, name}
    const existingMap = new Map<string, { id: string; name: string }>();
    for (const row of existingRows) {
        const name = (row.data as any)?.name || '';
        if (name) {
            existingMap.set(name.toLowerCase().trim(), { id: row.id, name });
        }
    }

    // Check each backup publisher against existing
    const backupPublishers = backupData.tables.publishers?.data || [];

    for (const backupPub of backupPublishers) {
        const backupName = getPublisherName(backupPub);
        if (!backupName) continue;


        // Check against all existing publishers
        for (const [, existing] of existingMap) {
            // Skip if same ID (not a duplicate, just an update)
            if (backupPub.id === existing.id) continue;

            const similarity = calculateSimilarity(backupName, existing.name);

            if (similarity >= SIMILARITY_THRESHOLD) {
                // Avoid duplicate entries in conflicts
                const alreadyExists = conflicts.some(
                    c => c.backupId === backupPub.id && c.existingId === existing.id
                );

                if (!alreadyExists) {
                    conflicts.push({
                        backupName,
                        backupId: backupPub.id,
                        existingName: existing.name,
                        existingId: existing.id,
                        similarity
                    });
                }
            }
        }
    }

    // Sort by similarity (highest first)
    conflicts.sort((a, b) => b.similarity - a.similarity);

    return conflicts;
}

// =============================================================================
// BACKUP HISTORY FUNCTIONS
// =============================================================================

/**
 * Log a backup operation (export or import) to the history table
 */
export async function logBackupOperation(
    operation: 'export' | 'import',
    origin: string,
    counts: Record<string, number>,
    status: 'success' | 'error' | 'partial' = 'success',
    errorMessage?: string,
    backupDate?: string
): Promise<void> {
    try {
        await supabase.from('backup_history').insert({
            operation,
            backup_date: backupDate || null,
            origin,
            counts,
            status,
            error_message: errorMessage || null
        });
    } catch (error) {
        // Don't fail the main operation if logging fails
        console.warn('[BackupService] Failed to log backup operation:', error);
    }
}

/**
 * Get backup history (most recent first)
 */
export async function getBackupHistory(limit: number = 20): Promise<BackupHistoryEntry[]> {
    const { data, error } = await supabase
        .from('backup_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('[BackupService] Failed to get backup history:', error);
        return [];
    }

    return (data || []) as BackupHistoryEntry[];
}
