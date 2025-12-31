import React, { useState, useEffect } from 'react';
import type { WorkbookPart } from '../types';

interface PartEditModalProps {
    isOpen: boolean;
    part: WorkbookPart | null;
    onClose: () => void;
    onSave: (id: string, updates: Partial<WorkbookPart>) => Promise<void>;
}

export const PartEditModal: React.FC<PartEditModalProps> = ({ isOpen, part, onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<WorkbookPart>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (part) {
            setFormData({
                weekId: part.weekId,
                section: part.section,
                tipoParte: part.tipoParte,
                tituloParte: part.tituloParte,
                descricaoParte: part.descricaoParte,
                duracao: part.duracao,
                horaInicio: part.horaInicio,
                modalidade: part.modalidade,
            });
        }
    }, [part]);

    if (!isOpen || !part) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(part.id, formData);
            onClose();
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao salvar alterações.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: keyof WorkbookPart, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Estilos comuns
    const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' };
    const inputStyle = { width: '100%', padding: '8px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '14px' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900">
                        Editar Parte
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500 text-2xl">
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* Linha 1: Semana e Horário */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label style={labelStyle}>Semana (ID)</label>
                            <input
                                type="text"
                                value={formData.weekId || ''}
                                disabled
                                style={{ ...inputStyle, background: '#F3F4F6', color: '#6B7280' }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Horário Início</label>
                            <input
                                type="time"
                                value={formData.horaInicio || ''}
                                onChange={e => handleChange('horaInicio', e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Linha 2: Seção e Tipo */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label style={labelStyle}>Seção</label>
                            <select
                                value={formData.section || ''}
                                onChange={e => handleChange('section', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="Tesouros da Palavra de Deus">Tesouros</option>
                                <option value="Faça Seu Melhor no Ministério">Ministério</option>
                                <option value="Nossa Vida Cristã">Vida Cristã</option>
                                <option value="Presidente">Presidente</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Tipo de Parte</label>
                            <input
                                type="text"
                                value={formData.tipoParte || ''}
                                onChange={e => handleChange('tipoParte', e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Linha 3: Título/Tema */}
                    <div>
                        <label style={labelStyle}>Título / Tema</label>
                        <input
                            type="text"
                            value={formData.tituloParte || ''}
                            onChange={e => handleChange('tituloParte', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    {/* Linha 4: Descrição */}
                    <div>
                        <label style={labelStyle}>Descrição / Detalhes</label>
                        <textarea
                            value={formData.descricaoParte || ''}
                            onChange={e => handleChange('descricaoParte', e.target.value)}
                            style={{ ...inputStyle, minHeight: '80px' }}
                        />
                    </div>

                    {/* Linha 5: Duração e Modalidade */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label style={labelStyle}>Duração (minutos ou string)</label>
                            <input
                                type="text"
                                value={formData.duracao || ''}
                                onChange={e => handleChange('duracao', e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Sala / Modalidade</label>
                            <input
                                type="text"
                                value={formData.modalidade || ''}
                                onChange={e => handleChange('modalidade', e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
