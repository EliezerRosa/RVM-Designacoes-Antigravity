import React, { useState, useEffect } from 'react';
import type { WorkbookPart } from '../types';

interface PartEditModalProps {
    isOpen: boolean;
    part: WorkbookPart | null;
    onClose: () => void;
    onSave: (id: string, updates: Partial<WorkbookPart>) => Promise<void>;
    onNavigate?: (direction: 'prev' | 'next') => void;
    currentIndex?: number;
    totalCount?: number;
}

export const PartEditModal: React.FC<PartEditModalProps> = ({ isOpen, part, onClose, onSave, onNavigate, currentIndex, totalCount }) => {
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

    // Estilos Inline (Substituindo Tailwind inexistente)
    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
    };

    const modalStyle: React.CSSProperties = {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        width: '100%',
        maxWidth: '650px',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid #E5E7EB',
        position: 'relative' // Para permitir centralização absoluta da navegação se necessário, mas flex funciona bem
    };


    const bodyStyle: React.CSSProperties = {
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '6px'
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #D1D5DB',
        borderRadius: '6px',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.15s ease-in-out',
        boxSizing: 'border-box' // Importante para width: 100%
    };

    const rowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
    };

    const footerStyle: React.CSSProperties = {
        padding: '16px 24px',
        borderTop: '1px solid #E5E7EB',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        backgroundColor: '#F9FAFB',
        borderBottomLeftRadius: '8px',
        borderBottomRightRadius: '8px',
    };

    const btnCancelStyle: React.CSSProperties = {
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 500,
        color: '#374151',
        backgroundColor: 'white',
        border: '1px solid #D1D5DB',
        borderRadius: '6px',
        cursor: 'pointer',
    };

    const btnSaveStyle: React.CSSProperties = {
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 500,
        color: 'white',
        backgroundColor: '#4F46E5', // Indigo 600
        border: 'none',
        borderRadius: '6px',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>
                        Editar Parte
                    </h3>

                    {onNavigate && currentIndex && totalCount ? (
                        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '12px', background: '#F3F4F6', padding: '4px 12px', borderRadius: '20px' }}>
                            <button
                                onClick={() => onNavigate('prev')}
                                disabled={currentIndex <= 1}
                                style={{ border: 'none', background: 'none', cursor: currentIndex <= 1 ? 'not-allowed' : 'pointer', opacity: currentIndex <= 1 ? 0.3 : 1, fontSize: '14px' }}
                            >
                                ⬅️
                            </button>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                Parte {currentIndex} de {totalCount}
                            </span>
                            <button
                                onClick={() => onNavigate('next')}
                                disabled={currentIndex >= totalCount}
                                style={{ border: 'none', background: 'none', cursor: currentIndex >= totalCount ? 'not-allowed' : 'pointer', opacity: currentIndex >= totalCount ? 0.3 : 1, fontSize: '14px' }}
                            >
                                ➡️
                            </button>
                        </div>
                    ) : null}
                    <button
                        onClick={onClose}
                        style={{ border: 'none', background: 'transparent', fontSize: '24px', color: '#9CA3AF', cursor: 'pointer' }}
                    >
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={bodyStyle}>

                    {/* Linha 1: Semana e Horário */}
                    <div style={rowStyle}>
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
                    <div style={rowStyle}>
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
                            style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }}
                        />
                    </div>

                    {/* Linha 5: Duração e Modalidade */}
                    <div style={rowStyle}>
                        <div>
                            <label style={labelStyle}>Duração (minutos)</label>
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
                </form>

                <div style={footerStyle}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={btnCancelStyle}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={(e) => handleSubmit(e as any)}
                        style={btnSaveStyle}
                        disabled={loading}
                    >
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};
