/**
 * BackupRestore Component - UI for backup and restore operations
 */

import { useState, useRef } from 'react';
import {
    exportAll,
    parseJSONBackup,
    parseExcelBackup,
    importBackup,
    getBackupPreview,
    getLastBackupDate,
    type BackupData,
    type ImportResult
} from '../services/backupService';

export function BackupRestore() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [previewData, setPreviewData] = useState<BackupData | null>(null);
    const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const lastBackup = getLastBackupDate();

    // =====================
    // EXPORT
    // =====================
    const handleExport = async () => {
        setLoading(true);
        setMessage(null);
        try {
            await exportAll();
            setMessage({ type: 'success', text: '✅ Backup exportado com sucesso! (JSON + Excel)' });
        } catch (error) {
            setMessage({ type: 'error', text: `❌ Erro ao exportar: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            setLoading(false);
        }
    };

    // =====================
    // IMPORT - File Selection
    // =====================
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setMessage(null);
        setPreviewData(null);

        try {
            let data: BackupData;

            if (file.name.endsWith('.json')) {
                const text = await file.text();
                data = parseJSONBackup(text);
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                data = await parseExcelBackup(file);
            } else {
                throw new Error('Formato de arquivo não suportado. Use .json ou .xlsx');
            }

            setPreviewData(data);
            setMessage({ type: 'info', text: `📋 Arquivo carregado: ${file.name}` });
        } catch (error) {
            setMessage({ type: 'error', text: `❌ Erro ao ler arquivo: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            setLoading(false);
        }
    };

    // =====================
    // IMPORT - Execute
    // =====================
    const handleImport = async () => {
        if (!previewData) return;

        const confirmed = window.confirm(
            importMode === 'replace'
                ? '⚠️ ATENÇÃO: Todos os dados atuais serão SUBSTITUÍDOS pelos dados do backup. Continuar?'
                : 'Os dados do backup serão MESCLADOS com os dados existentes. Continuar?'
        );

        if (!confirmed) return;

        setLoading(true);
        setMessage(null);

        try {
            const result: ImportResult = await importBackup(previewData, importMode);

            if (result.success) {
                setMessage({
                    type: 'success',
                    text: `✅ ${result.message}\n📊 Importados: ${result.counts.publishers} publicadores, ${result.counts.workbook_parts} partes`
                });
                setPreviewData(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                setMessage({
                    type: 'error',
                    text: `⚠️ ${result.message}\n${result.errors?.join('\n') || ''}`
                });
            }
        } catch (error) {
            setMessage({ type: 'error', text: `❌ Erro na importação: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            setLoading(false);
        }
    };

    // Cancelar e limpar
    const handleCancel = () => {
        setPreviewData(null);
        setMessage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // =====================
    // RENDER
    // =====================
    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            <h2 style={{ marginBottom: '24px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px' }}>
                💾 Backup e Restauração
            </h2>

            {/* Mensagens */}
            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    background: message.type === 'success' ? '#D1FAE5' : message.type === 'error' ? '#FEE2E2' : '#DBEAFE',
                    color: message.type === 'success' ? '#065F46' : message.type === 'error' ? '#991B1B' : '#1E40AF',
                    whiteSpace: 'pre-line'
                }}>
                    {message.text}
                </div>
            )}

            {/* EXPORT SECTION */}
            <div style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
            }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '16px' }}>
                    📦 Exportar Backup
                </h3>
                <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>
                    Exporta todos os dados do sistema em dois formatos: JSON e Excel.
                </p>

                {lastBackup && (
                    <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '12px' }}>
                        Último backup: {new Date(lastBackup).toLocaleString('pt-BR')}
                    </p>
                )}

                <button
                    onClick={handleExport}
                    disabled={loading}
                    style={{
                        padding: '10px 20px',
                        background: loading ? '#9CA3AF' : '#4F46E5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: loading ? 'wait' : 'pointer',
                        fontWeight: '600',
                        fontSize: '14px'
                    }}
                >
                    {loading ? '⏳ Exportando...' : '📥 Baixar Backup (JSON + Excel)'}
                </button>
            </div>

            {/* IMPORT SECTION */}
            <div style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '16px' }}>
                    📤 Restaurar Backup
                </h3>
                <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>
                    Importa dados de um arquivo de backup previamente exportado.
                </p>

                {/* File Input */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151', fontSize: '14px' }}>
                        Selecionar arquivo:
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.xlsx,.xls"
                        onChange={handleFileSelect}
                        disabled={loading}
                        style={{
                            padding: '8px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            width: '100%',
                            cursor: loading ? 'wait' : 'pointer'
                        }}
                    />
                </div>

                {/* Preview */}
                {previewData && (
                    <div style={{
                        background: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '16px'
                    }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '14px' }}>
                            📋 Preview do Backup
                        </h4>
                        <p style={{ color: '#6B7280', fontSize: '12px', marginBottom: '8px' }}>
                            Data do backup: {previewData.metadata.exportDate}
                        </p>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#E5E7EB' }}>
                                    <th style={{ padding: '8px', textAlign: 'left' }}>Tabela</th>
                                    <th style={{ padding: '8px', textAlign: 'right' }}>Registros</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getBackupPreview(previewData).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                        <td style={{ padding: '8px' }}>{item.table}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>{item.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Import Mode */}
                        <div style={{ marginTop: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151', fontSize: '14px' }}>
                                Modo de importação:
                            </label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="importMode"
                                        checked={importMode === 'replace'}
                                        onChange={() => setImportMode('replace')}
                                    />
                                    <span style={{ fontSize: '13px' }}>🔄 Substituir tudo</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="importMode"
                                        checked={importMode === 'merge'}
                                        onChange={() => setImportMode('merge')}
                                    />
                                    <span style={{ fontSize: '13px' }}>🔀 Mesclar (manter existentes)</span>
                                </label>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleImport}
                                disabled={loading}
                                style={{
                                    padding: '10px 20px',
                                    background: loading ? '#9CA3AF' : '#059669',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: loading ? 'wait' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '14px'
                                }}
                            >
                                {loading ? '⏳ Importando...' : '✅ Confirmar Importação'}
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={loading}
                                style={{
                                    padding: '10px 20px',
                                    background: '#fff',
                                    color: '#374151',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    fontSize: '14px'
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default BackupRestore;
