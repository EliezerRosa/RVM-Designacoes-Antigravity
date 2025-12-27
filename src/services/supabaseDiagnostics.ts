/**
 * Supabase Diagnostics Service
 * Captura, loga e retorna feedback detalhado de operações Supabase
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface SupabaseOperationResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: SupabaseErrorDetails;
    timing: {
        startTime: number;
        endTime: number;
        durationMs: number;
    };
    operation: string;
    table: string;
    rowsAffected?: number;
}

export interface SupabaseErrorDetails {
    code: string;
    message: string;
    details: string | null;
    hint: string | null;
    // Informações adicionais para diagnóstico
    httpStatus?: number;
    postgrestCode?: string;
}

export interface BatchUploadProgress {
    totalChunks: number;
    completedChunks: number;
    totalRows: number;
    insertedRows: number;
    failedRows: number;
    errors: SupabaseErrorDetails[];
    startTime: number;
    currentChunkStartTime?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrai detalhes de erro do Supabase de forma estruturada
 */
export function parseSupabaseError(error: unknown): SupabaseErrorDetails {
    if (!error) {
        return {
            code: 'UNKNOWN',
            message: 'Unknown error',
            details: null,
            hint: null,
        };
    }

    // Erro do Supabase/PostgREST
    if (typeof error === 'object' && error !== null) {
        const e = error as Record<string, unknown>;
        return {
            code: (e.code as string) || 'UNKNOWN',
            message: (e.message as string) || String(error),
            details: (e.details as string) || null,
            hint: (e.hint as string) || null,
            httpStatus: e.status as number | undefined,
            postgrestCode: e.code as string | undefined,
        };
    }

    return {
        code: 'UNKNOWN',
        message: String(error),
        details: null,
        hint: null,
    };
}

/**
 * Formata erro para exibição
 */
export function formatErrorForDisplay(error: SupabaseErrorDetails): string {
    let msg = `❌ [${error.code}] ${error.message}`;
    if (error.details) msg += `\n   Detalhes: ${error.details}`;
    if (error.hint) msg += `\n   Sugestão: ${error.hint}`;
    if (error.httpStatus) msg += `\n   HTTP Status: ${error.httpStatus}`;
    return msg;
}

/**
 * Loga operação para console com formatação
 */
export function logOperation(result: SupabaseOperationResult): void {
    const status = result.success ? '✅' : '❌';
    const timing = `${result.timing.durationMs}ms`;

    console.log(`[Supabase] ${status} ${result.operation} on ${result.table} (${timing})`);

    if (result.rowsAffected !== undefined) {
        console.log(`   Rows affected: ${result.rowsAffected}`);
    }

    if (!result.success && result.error) {
        console.error(formatErrorForDisplay(result.error));
    }
}

// ============================================================================
// DIAGNÓSTICO DE CONEXÃO
// ============================================================================

/**
 * Testa conexão com o Supabase e retorna diagnóstico
 */
export async function testConnection(): Promise<{
    connected: boolean;
    latencyMs: number;
    error?: SupabaseErrorDetails;
    serverTime?: string;
}> {
    const start = Date.now();

    try {
        const { data: _data, error } = await supabase
            .from('workbook_batches')
            .select('id')
            .limit(1);

        const latency = Date.now() - start;

        if (error) {
            return {
                connected: false,
                latencyMs: latency,
                error: parseSupabaseError(error),
            };
        }

        return {
            connected: true,
            latencyMs: latency,
            serverTime: new Date().toISOString(),
        };
    } catch (e) {
        return {
            connected: false,
            latencyMs: Date.now() - start,
            error: parseSupabaseError(e),
        };
    }
}

/**
 * Verifica limites e configurações atuais
 */
export async function checkDatabaseLimits(): Promise<{
    maxRows: number;
    estimatedTimeout: string;
    connectionPooling: string;
}> {
    // Valores padrão do Supabase (não são consultáveis diretamente via API)
    return {
        maxRows: 1000, // Padrão PostgREST
        estimatedTimeout: '3-8 seconds (anon/authenticated)',
        connectionPooling: 'Supavisor',
    };
}

// ============================================================================
// OPERAÇÕES MONITORADAS
// ============================================================================

/**
 * Executa SELECT com diagnóstico completo
 */
export async function selectWithDiagnostics<T>(
    table: string,
    query: () => Promise<{ data: T | null; error: unknown }>,
    description?: string
): Promise<SupabaseOperationResult<T>> {
    const startTime = Date.now();

    try {
        const { data, error } = await query();
        const endTime = Date.now();

        const result: SupabaseOperationResult<T> = {
            success: !error,
            data: data ?? undefined,
            error: error ? parseSupabaseError(error) : undefined,
            timing: {
                startTime,
                endTime,
                durationMs: endTime - startTime,
            },
            operation: description || 'SELECT',
            table,
            rowsAffected: Array.isArray(data) ? data.length : (data ? 1 : 0),
        };

        logOperation(result);
        return result;

    } catch (e) {
        const endTime = Date.now();
        const result: SupabaseOperationResult<T> = {
            success: false,
            error: parseSupabaseError(e),
            timing: {
                startTime,
                endTime,
                durationMs: endTime - startTime,
            },
            operation: description || 'SELECT',
            table,
        };

        logOperation(result);
        return result;
    }
}

/**
 * Executa UPSERT com diagnóstico e progresso
 */
export async function upsertWithDiagnostics(
    table: string,
    data: Record<string, unknown>[],
    options: {
        onConflict: string;
        chunkSize?: number;
        onProgress?: (progress: BatchUploadProgress) => void;
    }
): Promise<{
    success: boolean;
    totalInserted: number;
    totalFailed: number;
    errors: SupabaseErrorDetails[];
    durationMs: number;
}> {
    const chunkSize = options.chunkSize || 500;
    const chunks: Record<string, unknown>[][] = [];

    for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.slice(i, i + chunkSize));
    }

    const progress: BatchUploadProgress = {
        totalChunks: chunks.length,
        completedChunks: 0,
        totalRows: data.length,
        insertedRows: 0,
        failedRows: 0,
        errors: [],
        startTime: Date.now(),
    };

    console.log(`[Supabase] 📦 Iniciando upload: ${data.length} rows em ${chunks.length} chunks de ${chunkSize}`);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        progress.currentChunkStartTime = Date.now();

        console.log(`[Supabase] 📤 Chunk ${i + 1}/${chunks.length} (${chunk.length} rows)...`);

        try {
            const { error } = await supabase
                .from(table)
                .upsert(chunk, {
                    onConflict: options.onConflict,
                    ignoreDuplicates: false,
                });

            const chunkDuration = Date.now() - progress.currentChunkStartTime;

            if (error) {
                const errorDetails = parseSupabaseError(error);
                progress.errors.push(errorDetails);
                progress.failedRows += chunk.length;

                console.error(`[Supabase] ❌ Chunk ${i + 1} falhou (${chunkDuration}ms):`, formatErrorForDisplay(errorDetails));
            } else {
                progress.insertedRows += chunk.length;
                console.log(`[Supabase] ✅ Chunk ${i + 1} OK (${chunkDuration}ms, total: ${progress.insertedRows}/${progress.totalRows})`);
            }

        } catch (e) {
            const errorDetails = parseSupabaseError(e);
            progress.errors.push(errorDetails);
            progress.failedRows += chunk.length;
            console.error(`[Supabase] ❌ Chunk ${i + 1} exceção:`, formatErrorForDisplay(errorDetails));
        }

        progress.completedChunks++;

        if (options.onProgress) {
            options.onProgress({ ...progress });
        }
    }

    const totalDuration = Date.now() - progress.startTime;

    console.log(`[Supabase] 📊 Upload concluído em ${totalDuration}ms`);
    console.log(`   ✅ Inseridos: ${progress.insertedRows}/${progress.totalRows}`);
    console.log(`   ❌ Falhas: ${progress.failedRows}`);
    console.log(`   ⚠️ Erros: ${progress.errors.length}`);

    return {
        success: progress.failedRows === 0,
        totalInserted: progress.insertedRows,
        totalFailed: progress.failedRows,
        errors: progress.errors,
        durationMs: totalDuration,
    };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function runHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
        connection: boolean;
        latency: number;
        tablesAccessible: boolean;
    };
    errors: string[];
}> {
    const errors: string[] = [];

    // Test 1: Connection
    const connTest = await testConnection();
    if (!connTest.connected) {
        errors.push(`Connection failed: ${connTest.error?.message}`);
    }

    // Test 2: Tables accessible
    let tablesOk = false;
    try {
        const { error: batchError } = await supabase.from('workbook_batches').select('id').limit(1);
        const { error: partsError } = await supabase.from('workbook_parts').select('id').limit(1);

        if (batchError) errors.push(`workbook_batches: ${batchError.message}`);
        if (partsError) errors.push(`workbook_parts: ${partsError.message}`);

        tablesOk = !batchError && !partsError;
    } catch (e) {
        errors.push(`Table access exception: ${String(e)}`);
    }

    const status = errors.length === 0 ? 'healthy'
        : errors.length <= 1 ? 'degraded'
            : 'unhealthy';

    return {
        status,
        checks: {
            connection: connTest.connected,
            latency: connTest.latencyMs,
            tablesAccessible: tablesOk,
        },
        errors,
    };
}
