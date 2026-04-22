/**
 * PublisherImpedimentModal - RVM Designações
 *
 * Exibido quando salvar um publicador causaria impedimento em designações
 * já feitas para semanas atuais ou futuras.
 *
 * O operador pode:
 *  - Confirmar → salva o publicador E cancela as designações afetadas
 *  - Salvar sem cancelar → salva o publicador, mantém designações (alerta visual)
 *  - Cancelar → não salva nada
 */

import type { ImpedimentEntry } from '../services/publisherImpedimentService';
import { formatWeekFromDate } from '../utils/dateUtils';

interface Props {
    publisherName: string;
    impediments: ImpedimentEntry[];
    onConfirmAndCancel: () => void; // salva publisher + cancela designações
    onSaveOnly: () => void;         // salva publisher sem cancelar
    onCancel: () => void;           // não faz nada
}

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
};

const modal: React.CSSProperties = {
    background: '#fff',
    borderRadius: '12px',
    maxWidth: '560px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    overflow: 'hidden',
};

export function PublisherImpedimentModal({ publisherName, impediments, onConfirmAndCancel, onSaveOnly, onCancel }: Props) {
    return (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div style={modal}>
                {/* Header */}
                <div style={{ background: '#FEF3C7', padding: '16px 20px', borderBottom: '1px solid #FDE68A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '22px' }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: '#92400E' }}>
                                Alteração causa impedimento em designações
                            </div>
                            <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                                {publisherName} está designado em {impediments.length} parte{impediments.length !== 1 ? 's' : ''} que ficarão inválidas
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lista de impedimentos */}
                <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '16px 20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Designações afetadas
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {impediments.map(({ part, reason }) => (
                            <div key={part.id} style={{
                                background: '#FFF7ED',
                                border: '1px solid #FED7AA',
                                borderRadius: '8px',
                                padding: '10px 12px',
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1C1917' }}>
                                    {part.tituloParte || part.tipoParte}
                                </div>
                                <div style={{ fontSize: '12px', color: '#78716C', marginTop: '2px' }}>
                                    📅 {formatWeekFromDate(part.date || part.weekId)} &nbsp;·&nbsp; {part.funcao}
                                </div>
                                <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
                                    ❌ {reason}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ações */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                        onClick={onCancel}
                        style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSaveOnly}
                        style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    >
                        Salvar sem cancelar
                    </button>
                    <button
                        onClick={onConfirmAndCancel}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    >
                        Salvar e cancelar designações
                    </button>
                </div>
            </div>
        </div>
    );
}
