/**
 * BulkResetModal - Modal para resetar partes em lote
 * Permite selecionar um período de datas e resetar todas as partes para PENDENTE
 */
import { useState } from 'react';
import { workbookService } from '../services/workbookService';

interface BulkResetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function BulkResetModal({ isOpen, onClose, onSuccess }: BulkResetModalProps) {
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<number | null>(null);

    if (!isOpen) return null;

    const handleReset = async () => {
        if (!fromDate || !toDate) {
            setError('Selecione as duas datas');
            return;
        }

        if (fromDate > toDate) {
            setError('A data inicial deve ser anterior à data final');
            return;
        }

        const confirm = window.confirm(
            `Tem certeza que deseja resetar TODAS as partes de ${fromDate} até ${toDate}?\n\n` +
            `Isso irá:\n` +
            `• Mudar status para PENDENTE\n` +
            `• Limpar publicadores atribuídos`
        );

        if (!confirm) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const count = await workbookService.resetDateRange(fromDate, toDate);
            setResult(count);
            // Notificar sucesso após 1.5s
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFromDate('');
        setToDate('');
        setError(null);
        setResult(null);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div style={{
                background: '#1f2937',
                borderRadius: '12px',
                padding: '25px',
                width: '450px',
                maxWidth: '95vw',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}>
                <h2 style={{
                    margin: '0 0 20px 0',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    🔄 Resetar Partes em Lote
                </h2>

                <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '0.9em' }}>
                    Selecione o período de datas para resetar.<br />
                    Todas as partes serão alteradas para <strong style={{ color: '#fbbf24' }}>PENDENTE</strong> e os publicadores serão removidos.
                </p>

                {/* Date inputs */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '5px', fontSize: '0.85em' }}>
                            De:
                        </label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                background: '#111827',
                                color: '#fff',
                                fontSize: '1em',
                            }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '5px', fontSize: '0.85em' }}>
                            Até:
                        </label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                background: '#111827',
                                color: '#fff',
                                fontSize: '1em',
                            }}
                        />
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        background: '#7f1d1d',
                        color: '#fecaca',
                        padding: '10px 15px',
                        borderRadius: '8px',
                        marginBottom: '15px',
                        fontSize: '0.9em',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Success message */}
                {result !== null && (
                    <div style={{
                        background: '#14532d',
                        color: '#86efac',
                        padding: '10px 15px',
                        borderRadius: '8px',
                        marginBottom: '15px',
                        fontSize: '0.9em',
                    }}>
                        ✅ {result} partes resetadas com sucesso!
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        style={{
                            background: '#374151',
                            color: '#fff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '0.95em',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={loading || !fromDate || !toDate}
                        style={{
                            background: loading ? '#6b7280' : '#ef4444',
                            color: '#fff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: (loading || !fromDate || !toDate) ? 'not-allowed' : 'pointer',
                            fontSize: '0.95em',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        {loading ? (
                            <>⏳ Processando...</>
                        ) : (
                            <>🔄 Resetar Período</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
