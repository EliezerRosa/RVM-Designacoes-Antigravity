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
        special_events: number;
        extraction_history: number;
        local_needs_preassignments: number;
    };
    errors?: string[];
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

    // Sheet 1: Publishers
    const publishersSheet = XLSX.utils.json_to_sheet(data.tables.publishers.data);
    XLSX.utils.book_append_sheet(workbook, publishersSheet, 'publishers');

    // Sheet 2: Workbook Parts
    const partsSheet = XLSX.utils.json_to_sheet(data.tables.workbook_parts.data);
    XLSX.utils.book_append_sheet(workbook, partsSheet, 'workbook_parts');

    // Sheet 3: Special Events
    const eventsSheet = XLSX.utils.json_to_sheet(data.tables.special_events.data);
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

    // Export JSON
    const jsonData = await exportToJSON();
    const jsonBlob = new Blob([jsonData], { type: 'application/json' });
    downloadBlob(jsonBlob, `backup_rvm_${timestamp}.json`);

    // Export Excel
    const excelBlob = await exportToExcel();
    downloadBlob(excelBlob, `backup_rvm_${timestamp}.xlsx`);

    // Save last export date in localStorage
    localStorage.setItem('lastBackupDate', new Date().toISOString());
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
                const publishers = XLSX.utils.sheet_to_json(workbook.Sheets['publishers']) as Publisher[];
                const workbookParts = XLSX.utils.sheet_to_json(workbook.Sheets['workbook_parts']) as WorkbookPart[];
                const specialEvents = workbook.Sheets['special_events']
                    ? XLSX.utils.sheet_to_json(workbook.Sheets['special_events'])
                    : [];
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
        special_events: 0,
        extraction_history: 0,
        local_needs_preassignments: 0
    };

    try {
        // In replace mode, delete existing data first
        if (mode === 'replace') {
            await supabase.from('workbook_parts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('publishers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('special_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('extraction_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('local_needs_preassignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }

        // Import publishers
        if (data.tables.publishers.data.length > 0) {
            // Sanitizar publishers - garantir que campos obrigatórios não sejam null
            const sanitizedPublishers = data.tables.publishers.data.map((pub: Publisher & { data?: Record<string, unknown> }) => ({
                ...pub,
                // Garantir que o campo 'data' (JSONB) exista se a tabela usar esse formato
                data: pub.data || {
                    id: pub.id,
                    name: pub.name || 'Sem Nome',
                    gender: pub.gender || 'brother',
                    condition: pub.condition || 'Publicador',
                    phone: pub.phone || '',
                    isBaptized: pub.isBaptized ?? true,
                    isServing: pub.isServing ?? true,
                    ageGroup: pub.ageGroup || 'Adulto',
                    parentIds: pub.parentIds || [],
                    isHelperOnly: pub.isHelperOnly ?? false,
                    canPairWithNonParent: pub.canPairWithNonParent ?? true,
                    privileges: pub.privileges || {},
                    privilegesBySection: pub.privilegesBySection || {},
                    availability: pub.availability || { mode: 'always', exceptionDates: [], availableDates: [] },
                    aliases: pub.aliases || []
                },
                name: pub.name || 'Sem Nome'
            }));

            const { error } = await supabase
                .from('publishers')
                .upsert(sanitizedPublishers, { onConflict: 'id' });
            if (error) {
                errors.push(`Publishers: ${error.message}`);
            } else {
                counts.publishers = data.tables.publishers.data.length;
            }
        }

        // Import workbook_parts
        if (data.tables.workbook_parts.data.length > 0) {
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
        if (data.tables.special_events.data.length > 0) {
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
        if (data.tables.extraction_history.data.length > 0) {
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
        if (data.tables.local_needs_preassignments.data.length > 0) {
            const { error } = await supabase
                .from('local_needs_preassignments')
                .upsert(data.tables.local_needs_preassignments.data, { onConflict: 'id' });
            if (error) {
                errors.push(`Local Needs Preassignments: ${error.message}`);
            } else {
                counts.local_needs_preassignments = data.tables.local_needs_preassignments.data.length;
            }
        }

        return {
            success: errors.length === 0,
            message: errors.length === 0
                ? `Importação concluída com sucesso!`
                : `Importação concluída com ${errors.length} erro(s)`,
            counts,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (error) {
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
        { table: 'Publicadores', count: data.tables.publishers.count },
        { table: 'Partes da Apostila', count: data.tables.workbook_parts.count },
        { table: 'Eventos Especiais', count: data.tables.special_events.count },
        { table: 'Histórico de Extração', count: data.tables.extraction_history.count },
        { table: 'Fila de Necessidades', count: data.tables.local_needs_preassignments.count }
    ];
}

/**
 * Get last backup date from localStorage
 */
export function getLastBackupDate(): string | null {
    return localStorage.getItem('lastBackupDate');
}
