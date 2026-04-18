import { useMemo } from 'react';
import type { WorkbookPart } from '../../types';

interface Props {
    completableParts: WorkbookPart[];
    completedParts: WorkbookPart[];
    canComplete: boolean;
    canUndo: boolean;
    busyPartId?: string | null;
    onComplete: (partId: string) => Promise<void>;
    onUndo: (partId: string) => Promise<void>;
}

export function PartCompletionMicroUi({ completableParts, completedParts, canComplete, canUndo, busyPartId = null, onComplete, onUndo }: Props) {
    const visibleCompletable = useMemo(() => completableParts.slice(0, 3), [completableParts]);
    const visibleCompleted = useMemo(() => completedParts.slice(0, 2), [completedParts]);

    if ((visibleCompletable.length === 0 && visibleCompleted.length === 0) || (!canComplete && !canUndo)) {
        return null;
    }

    return (
        <div style={{
            margin: '0 10px 10px 10px',
            padding: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)',
            border: '1px solid #BFDBFE',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Micro-UI de conclusão
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E3A8A' }}>
                        Concluir partes da semana e desfazer conclusão recente
                    </div>
                </div>
            </div>

            {visibleCompletable.length > 0 && canComplete && (
                <div style={{ marginBottom: visibleCompleted.length > 0 ? '10px' : 0 }}>
                    <div style={{ fontSize: '12px', color: '#1E40AF', marginBottom: '6px' }}>Prontas para concluir:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {visibleCompletable.map(part => {
                            const isBusy = busyPartId === part.id;
                            return (
                                <div key={part.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '10px', background: '#FFFFFF' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{part.tipoParte}</div>
                                        <div style={{ fontSize: '12px', color: '#4B5563' }}>{part.tituloParte || 'Sem titulo'} • {part.resolvedPublisherName || 'Sem designado'}</div>
                                    </div>
                                    <button onClick={() => void onComplete(part.id)} disabled={isBusy} style={{ border: 'none', borderRadius: '8px', padding: '8px 10px', cursor: isBusy ? 'wait' : 'pointer', background: '#1D4ED8', color: '#EFF6FF', fontSize: '12px', fontWeight: 600, opacity: isBusy ? 0.7 : 1 }}>
                                        Concluir
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {visibleCompleted.length > 0 && canUndo && (
                <div>
                    <div style={{ fontSize: '12px', color: '#1E40AF', marginBottom: '6px' }}>Concluídas recentemente:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {visibleCompleted.map(part => {
                            const isBusy = busyPartId === part.id;
                            return (
                                <div key={part.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '10px', background: '#FFFFFF' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{part.tipoParte}</div>
                                        <div style={{ fontSize: '12px', color: '#4B5563' }}>{part.tituloParte || 'Sem titulo'} • concluída</div>
                                    </div>
                                    <button onClick={() => void onUndo(part.id)} disabled={isBusy} style={{ border: '1px solid #93C5FD', borderRadius: '8px', padding: '8px 10px', cursor: isBusy ? 'wait' : 'pointer', background: '#EFF6FF', color: '#1E3A8A', fontSize: '12px', fontWeight: 600, opacity: isBusy ? 0.7 : 1 }}>
                                        Desfazer
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}