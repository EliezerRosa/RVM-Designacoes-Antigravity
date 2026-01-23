import { useState } from 'react';
import type { WorkbookPart, Publisher } from '../types';
import { sendS89ViaWhatsApp, copyS89ToClipboard } from '../services/s89Generator';

interface S89SelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    weekParts: WorkbookPart[];
    weekId: string;
    publishers: Publisher[];
}

export function S89SelectionModal({ isOpen, onClose, weekParts, weekId, publishers }: S89SelectionModalProps) {
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    if (!isOpen) return null;

    // Helper to find publisher phone
    const getPublisher = (name?: string) => publishers.find(p => p.name === name);

    // Helpers for S-89 Logic (reused from ApprovalPanel logic)
    const extractPartNumber = (titulo: string): string => {
        const match = titulo?.match(/^(\d+)\./);
        return match ? match[1] : '';
    };

    const handleSend = async (part: WorkbookPart) => {
        setProcessingIds(prev => new Set(prev).add(part.id));
        try {
            const isAjudante = part.funcao === 'Ajudante';
            const publisherName = part.resolvedPublisherName || part.rawPublisherName;
            const foundPublisher = getPublisher(publisherName);
            const phone = foundPublisher?.phone;

            const currentPartNumber = extractPartNumber(part.tituloParte || part.tipoParte);

            let assistantName: string | undefined;
            let titularName: string | undefined;

            if (isAjudante) {
                // Find Titular
                const titular = weekParts.find(p => {
                    const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                    return pNum === currentPartNumber && p.funcao === 'Titular' && p.id !== part.id;
                });
                titularName = titular?.resolvedPublisherName || titular?.rawPublisherName;
            } else {
                // Find Assistant
                const assistant = weekParts.find(p => {
                    const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                    return pNum === currentPartNumber && p.funcao === 'Ajudante' && p.id !== part.id;
                });
                assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
            }

            // Copy to clipboard first (High Fidelity Image)
            // Note: For Assistant parts, this uses the assistant as the 'Student Name' on the card, consistent with current service behavior.
            const success = await copyS89ToClipboard(part, assistantName);
            if (!success) {
                alert('Erro ao gerar imagem do cartão S-89.');
                return;
            }

            // Send WhatsApp
            sendS89ViaWhatsApp(part, assistantName, phone, isAjudante, titularName);

        } catch (error) {
            console.error('Erro ao enviar S-89:', error);
            alert('Erro ao processar envio.');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(part.id);
                return next;
            });
        }
    };

    // Filter relevant parts (have publisher assigned)
    const validParts = weekParts.filter(p => p.resolvedPublisherName || p.rawPublisherName);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '12px', width: '500px', maxWidth: '95vw',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1em', color: '#111827' }}>📤 Enviar Cartões S-89 (Semana {weekId})</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
                </div>

                {/* List */}
                <div style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {validParts.length === 0 ? (
                        <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px' }}>Nenhuma designação com publicador nesta semana.</div>
                    ) : (
                        validParts.map(part => {
                            const isProcessing = processingIds.has(part.id);
                            return (
                                <div key={part.id} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: '600', color: '#374151', fontSize: '0.9em' }}>{part.modalidade} {part.tituloParte ? `- ${part.tituloParte}` : ''}</div>
                                        <div style={{ fontSize: '0.85em', color: '#6B7280' }}>
                                            👤 {part.resolvedPublisherName || part.rawPublisherName}
                                            {part.funcao === 'Ajudante' && <span style={{ marginLeft: '4px', background: '#E0E7FF', color: '#3730A3', padding: '1px 4px', borderRadius: '4px', fontSize: '0.9em' }}>Ajudante</span>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleSend(part)}
                                        disabled={isProcessing}
                                        style={{
                                            background: '#25D366', color: 'white', border: 'none',
                                            padding: '8px 12px', borderRadius: '6px', cursor: isProcessing ? 'wait' : 'pointer',
                                            fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                            opacity: isProcessing ? 0.7 : 1
                                        }}
                                    >
                                        {isProcessing ? '⏳...' : 'Zap 📤'}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
                    <button onClick={onClose} style={{
                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #D1D5DB',
                        background: 'white', color: '#374151', cursor: 'pointer'
                    }}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
