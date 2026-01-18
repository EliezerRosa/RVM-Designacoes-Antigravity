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
    detectDuplicates,
    type BackupData,
    type ImportResult,
    type DuplicateConflict
} from '../services/backupService';

export function BackupRestore() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [previewData, setPreviewData] = useState<BackupData | null>(null);
    const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
    const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateConflict[]>([]);
    const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);
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
        setDuplicateWarnings([]);
        setShowDuplicateDetails(false);

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

            // Detectar duplicatas potenciais
            const duplicates = await detectDuplicates(data);
            setDuplicateWarnings(duplicates);

            if (duplicates.length > 0) {
                setMessage({ type: 'info', text: `📋 Arquivo carregado: ${file.name}\n⚠️ ${duplicates.length} possíveis duplicatas detectadas!` });
            } else {
                setMessage({ type: 'info', text: `📋 Arquivo carregado: ${file.name}\n✅ Nenhuma duplicata detectada.` });
            }
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

                        {/* Date Conflict Alert */}
                        {(() => {
                            const backupDate = new Date(previewData.metadata.exportDate);
                            const now = new Date();
                            const diffMs = now.getTime() - backupDate.getTime();
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const diffMonths = Math.floor(diffDays / 30);
                            const diffYears = Math.floor(diffDays / 365);

                            let timeAgo = '';
                            let severity: 'low' | 'medium' | 'high' = 'low';

                            if (diffDays < 0) {
                                timeAgo = 'Backup do futuro (!)';
                                severity = 'high';
                            } else if (diffDays === 0) {
                                timeAgo = 'Backup de hoje';
                                severity = 'low';
                            } else if (diffDays === 1) {
                                timeAgo = 'Backup de ontem';
                                severity = 'low';
                            } else if (diffDays < 7) {
                                timeAgo = `${diffDays} dias atrás`;
                                severity = 'low';
                            } else if (diffDays < 30) {
                                const weeks = Math.floor(diffDays / 7);
                                timeAgo = `${weeks} semana${weeks > 1 ? 's' : ''} atrás`;
                                severity = 'medium';
                            } else if (diffMonths < 12) {
                                timeAgo = `${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'} atrás`;
                                severity = 'high';
                            } else {
                                timeAgo = `${diffYears} ano${diffYears > 1 ? 's' : ''} e ${diffMonths % 12} meses atrás`;
                                severity = 'high';
                            }

                            const bgColor = severity === 'low' ? '#D1FAE5' : severity === 'medium' ? '#FEF3C7' : '#FEE2E2';
                            const borderColor = severity === 'low' ? '#10B981' : severity === 'medium' ? '#F59E0B' : '#EF4444';
                            const textColor = severity === 'low' ? '#065F46' : severity === 'medium' ? '#92400E' : '#991B1B';
                            const icon = severity === 'low' ? '✅' : severity === 'medium' ? '⚠️' : '🚨';

                            return (
                                <div style={{
                                    padding: '10px 14px',
                                    background: bgColor,
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: '600', color: textColor, fontSize: '13px' }}>
                                            {icon} {timeAgo}
                                        </span>
                                        <p style={{ margin: '4px 0 0 0', color: textColor, fontSize: '11px', opacity: 0.8 }}>
                                            Backup: {backupDate.toLocaleDateString('pt-BR')} às {backupDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    {severity !== 'low' && (
                                        <span style={{ fontSize: '11px', color: textColor, fontWeight: '500' }}>
                                            Retroage {diffDays} dias
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
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

                        {/* Duplicate Warnings */}
                        {duplicateWarnings.length > 0 && (
                            <div style={{
                                marginTop: '16px',
                                padding: '12px',
                                background: '#FEF3C7',
                                border: '1px solid #F59E0B',
                                borderRadius: '8px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: '600', color: '#92400E', fontSize: '14px' }}>
                                        ⚠️ {duplicateWarnings.length} possíveis duplicatas detectadas
                                    </span>
                                    <button
                                        onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
                                        style={{
                                            padding: '4px 10px',
                                            background: '#F59E0B',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        {showDuplicateDetails ? '🔼 Ocultar' : '🔽 Ver detalhes'}
                                    </button>
                                </div>
                                <p style={{ color: '#92400E', fontSize: '12px', margin: 0 }}>
                                    Nomes do backup similares a publicadores existentes. Revise antes de importar.
                                </p>

                                {showDuplicateDetails && (
                                    <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', background: '#fff' }}>
                                            <thead>
                                                <tr style={{ background: '#FDE68A' }}>
                                                    <th style={{ padding: '6px', textAlign: 'left' }}>Backup</th>
                                                    <th style={{ padding: '6px', textAlign: 'left' }}>Existente</th>
                                                    <th style={{ padding: '6px', textAlign: 'right' }}>Similar.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {duplicateWarnings.map((dup, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #FDE68A' }}>
                                                        <td style={{ padding: '6px' }}>{dup.backupName}</td>
                                                        <td style={{ padding: '6px' }}>{dup.existingName}</td>
                                                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: '600', color: dup.similarity === 100 ? '#DC2626' : '#92400E' }}>
                                                            {dup.similarity}%
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
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
