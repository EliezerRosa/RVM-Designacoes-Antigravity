import { useState } from 'react';
import type { Publisher, WorkbookPart } from '../types';

/**
 * ActionControlPanel – placeholder UI for Phase 3.
 * Shows basic info about the selected part and provides a "Confirm" button.
 * Future work will add simulation preview and execution via workbookService.
 */
interface Props {
    selectedPartId: string | null;
    parts: WorkbookPart[];
    publishers: Publisher[];
}

export default function ActionControlPanel({ selectedPartId, parts }: Props) {
    const [status, setStatus] = useState<string>('');

    const selectedPart = parts.find(p => p.id === selectedPartId);

    const handleConfirm = async () => {
        if (!selectedPart) return;
        // Placeholder: In a real implementation this would call an executor service.
        setStatus(`Ação confirmada para a parte ${selectedPart.tituloParte || selectedPart.id}`);
    };

    return (
        <div style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {selectedPart ? (
                <>
                    <h3 style={{ margin: '0 0 8px 0' }}>Detalhes da Parte</h3>
                    <p><strong>ID:</strong> {selectedPart.id}</p>
                    <p><strong>Título:</strong> {selectedPart.tituloParte ?? 'Sem título'}</p>
                    <p><strong>Semana:</strong> {selectedPart.weekId}</p>
                    <button
                        onClick={handleConfirm}
                        style={{ marginTop: 'auto', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 12px' }}
                    >
                        Confirmar Ação
                    </button>
                    {status && <p style={{ marginTop: '8px', color: '#4F46E5' }}>{status}</p>}
                </>
            ) : (
                <p style={{ color: '#6B7280' }}>Selecione uma parte no carrossel para ver detalhes e ações.</p>
            )}
        </div>
    );
}
