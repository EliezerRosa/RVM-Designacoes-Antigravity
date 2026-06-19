import React, { useState } from 'react';
import { WorkbookPart } from '../../types';

interface ManualReplacementModalProps {
    isOpen: boolean;
    part: WorkbookPart | null;
    oldPublisherName: string;
    newPublisherName: string;
    onConfirm: (options: {
        notifyOld: boolean;
        notifyNew: boolean;
        notifyPartner: boolean;
    }) => void;
    onCancel: () => void;
}

export function ManualReplacementModal({
    isOpen,
    part,
    oldPublisherName,
    newPublisherName,
    onConfirm,
    onCancel
}: ManualReplacementModalProps) {
    const [notifyOld, setNotifyOld] = useState(true);
    const [notifyNew, setNotifyNew] = useState(true);
    const [notifyPartner, setNotifyPartner] = useState(true);

    if (!isOpen || !part) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999
        }}>
            <div style={{
                background: '#1E293B',
                width: '90%', maxWidth: '450px',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid #334155',
                overflow: 'hidden',
                animation: 'modalSlideUp 0.3s ease-out'
            }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #334155' }}>
                    <h2 style={{ margin: 0, color: '#F8FAFC', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🔄</span> Confirmação de Substituição
                    </h2>
                </div>

                <div style={{ padding: '24px', color: '#CBD5E1', fontSize: '0.95rem' }}>
                    <p style={{ margin: '0 0 16px 0', lineHeight: 1.5 }}>
                        Você está substituindo manualmente o publicador de uma parte já preenchida.
                    </p>

                    <div style={{ background: '#0F172A', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #334155' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: '#94A3B8' }}>Parte:</strong> <span style={{ color: '#E2E8F0' }}>{part.tituloParte || part.tipoParte}</span>
                        </div>
                        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: '#94A3B8' }}>Sai:</strong>
                            <span style={{ color: '#EF4444', textDecoration: 'line-through' }}>{oldPublisherName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: '#94A3B8' }}>Entra:</strong>
                            <span style={{ color: '#10B981', fontWeight: 'bold' }}>{newPublisherName}</span>
                        </div>
                    </div>

                    <p style={{ margin: '0 0 12px 0', fontWeight: '600', color: '#F8FAFC' }}>Opções de Notificação (Z-API):</p>
                    
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={notifyOld} 
                            onChange={e => setNotifyOld(e.target.checked)}
                            style={{ marginTop: '4px', width: '16px', height: '16px', accentColor: '#3B82F6' }}
                        />
                        <div>
                            <div style={{ color: '#F8FAFC', fontWeight: '500' }}>Avisar Irmão Substituído</div>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Envia mensagem avisando que a parte foi repassada.</div>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={notifyNew} 
                            onChange={e => setNotifyNew(e.target.checked)}
                            style={{ marginTop: '4px', width: '16px', height: '16px', accentColor: '#3B82F6' }}
                        />
                        <div>
                            <div style={{ color: '#F8FAFC', fontWeight: '500' }}>Enviar S-89 (Substituto)</div>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Envia a papeleta S-89 pro novo irmão com aviso de que é uma substituição.</div>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={notifyPartner} 
                            onChange={e => setNotifyPartner(e.target.checked)}
                            style={{ marginTop: '4px', width: '16px', height: '16px', accentColor: '#3B82F6' }}
                        />
                        <div>
                            <div style={{ color: '#F8FAFC', fontWeight: '500' }}>Avisar o Parceiro</div>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Se houver ajudante/titular, avisa que a dupla mudou.</div>
                        </div>
                    </label>
                </div>

                <div style={{ padding: '16px 24px', background: '#0F172A', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #334155' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '10px 16px',
                            background: 'transparent',
                            color: '#94A3B8',
                            border: '1px solid #475569',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm({ notifyOld, notifyNew, notifyPartner })}
                        style={{
                            padding: '10px 16px',
                            background: '#3B82F6',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        ✓ Confirmar Troca
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes modalSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
