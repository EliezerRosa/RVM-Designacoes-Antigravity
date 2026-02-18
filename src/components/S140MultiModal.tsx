/**
 * S140MultiModal — Modal para geração de pacote S-140 multi-semanas
 * Extraído de WorkbookManager.tsx (Fase 5 da Auditoria)
 */

import { useState } from 'react';
import type { WorkbookPart } from '../types';
import { downloadS140UnifiedMultiWeek } from '../services/s140GeneratorUnified';

interface S140MultiModalProps {
    isOpen: boolean;
    parts: WorkbookPart[];
    onClose: () => void;
}

export function S140MultiModal({ isOpen, parts, onClose }: S140MultiModalProps) {
    const [startWeek, setStartWeek] = useState('');
    const [endWeek, setEndWeek] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const weekOptions = [...new Set(parts.map(p => p.weekId))].sort().map(weekId => {
        const part = parts.find(p => p.weekId === weekId);
        const year = part ? new Date(part.date).getFullYear() : '';
        const display = part?.weekDisplay ? `${part.weekDisplay} ${year}` : weekId;
        return { weekId, display };
    });

    const handleGenerate = async () => {
        if (!startWeek || !endWeek) { alert('Selecione semana inicial e final'); return; }
        const allWeeks = weekOptions.map(w => w.weekId);
        const startIdx = allWeeks.indexOf(startWeek);
        const endIdx = allWeeks.indexOf(endWeek);
        if (startIdx > endIdx) { alert('Semana inicial deve ser anterior ou igual à final'); return; }
        const selectedWeeks = allWeeks.slice(startIdx, endIdx + 1);
        try {
            setLoading(true);
            await downloadS140UnifiedMultiWeek(parts, selectedWeeks);
            setStartWeek('');
            setEndWeek('');
            onClose();
        } catch (err) {
            alert('Erro ao gerar pacote: ' + (err instanceof Error ? err.message : 'Erro'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9000
        }}>
            <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: '#1F2937' }}>📦 Gerar Pacote S-140</h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Semana Inicial</label>
                    <select value={startWeek} onChange={e => setStartWeek(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}>
                        <option value="">Selecione...</option>
                        {weekOptions.map(w => (
                            <option key={w.weekId} value={w.weekId}>{w.display}</option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Semana Final</label>
                    <select value={endWeek} onChange={e => setEndWeek(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}>
                        <option value="">Selecione...</option>
                        {weekOptions.map(w => (
                            <option key={w.weekId} value={w.weekId}>{w.display}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !startWeek || !endWeek}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#0F766E', color: 'white', cursor: 'pointer', fontWeight: '500' }}
                    >
                        {loading ? 'Gerando...' : '📄 Gerar PDF'}
                    </button>
                </div>
                <div style={{ marginTop: '16px', padding: '12px', background: '#F0F9FF', borderRadius: '6px', fontSize: '12px', color: '#0369A1' }}>
                    💡 O PDF terá uma página por semana, no formato paisagem A4.
                </div>
            </div>
        </div>
    );
}
