/**
 * S140PreviewCarousel - Carrossel de previews S-140 B A4
 * 
 * Exibe um carrossel horizontal com previews do S-140 para cada semana.
 * Features:
 * - Navegação com setas ◀️ ▶️
 * - Botão para ampliar em fullscreen
 * - Renderiza HTML inline do S-140
 */

import { useState, useEffect } from 'react';
import type { WorkbookPart } from '../types';
import { prepareS140RoomBA4Data, generateS140RoomBA4HTML } from '../services/s140GeneratorRoomBA4';

interface Props {
    weekParts: Record<string, WorkbookPart[]>;  // weekId -> parts
    weekOrder: string[];  // Ordem das semanas
    // NEW: External control props
    currentWeekId?: string | null;
    onWeekChange?: (weekId: string) => void;
}

export function S140PreviewCarousel({ weekParts, weekOrder, currentWeekId, onWeekChange }: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Sync with external control
    useEffect(() => {
        if (currentWeekId) {
            const index = weekOrder.indexOf(currentWeekId);
            if (index !== -1 && index !== currentIndex) {
                setCurrentIndex(index);
            }
        }
    }, [currentWeekId, weekOrder]);

    const [isFullscreen, setIsFullscreen] = useState(false);

    if (weekOrder.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
                Nenhuma semana para preview
            </div>
        );
    }

    const activeWeekId = weekOrder[currentIndex];
    const currentParts = weekParts[activeWeekId] || [];

    // Gerar HTML do S-140
    let s140HTML = '<div style="padding: 20px; color: #666;">Sem partes para esta semana</div>';
    try {
        if (currentParts.length > 0) {
            const weekData = prepareS140RoomBA4Data(currentParts);
            s140HTML = generateS140RoomBA4HTML(weekData);
        }
    } catch (e) {
        s140HTML = `<div style="padding: 20px; color: #B91C1C;">Erro ao gerar preview: ${e}</div>`;
    }

    const handleNavigate = (newIndex: number) => {
        setCurrentIndex(newIndex);
        if (onWeekChange) {
            onWeekChange(weekOrder[newIndex]);
        }
    };

    const goToPrev = () => {
        if (currentIndex > 0) {
            handleNavigate(currentIndex - 1);
        }
    };

    const goToNext = () => {
        if (currentIndex < weekOrder.length - 1) {
            // Check if user is navigating beyond current retention/visibility logic if needed
            // For now, allow navigation
            handleNavigate(currentIndex + 1);
        }
    };

    // Obter display da semana
    const weekDisplay = currentParts[0]?.weekDisplay || activeWeekId;

    // Estilos
    const containerStyle: React.CSSProperties = {
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#F9FAFB',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#4F46E5',
        color: 'white',
    };

    const navBtnStyle: React.CSSProperties = {
        padding: '4px 12px',
        border: 'none',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.2)',
        color: 'white',
        cursor: 'pointer',
        fontSize: '14px',
    };

    const previewStyle: React.CSSProperties = {
        height: '400px',
        overflow: 'auto',
        background: 'white',
        padding: '10px',
    };

    const fullscreenOverlay: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
    };

    const fullscreenHeader: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#1F2937',
        color: 'white',
    };

    const fullscreenContent: React.CSSProperties = {
        flex: 1,
        overflow: 'auto',
        background: 'white',
        margin: '20px',
        borderRadius: '8px',
    };

    return (
        <>
            <div style={containerStyle}>
                {/* Header com navegação */}
                <div style={headerStyle}>
                    <button
                        onClick={goToPrev}
                        disabled={currentIndex === 0}
                        style={{ ...navBtnStyle, opacity: currentIndex === 0 ? 0.3 : 1 }}
                    >
                        ◀️
                    </button>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            📄 S-140 Sala B A4
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>
                            {weekDisplay} ({currentIndex + 1}/{weekOrder.length})
                        </div>
                    </div>
                    <button
                        onClick={goToNext}
                        disabled={currentIndex === weekOrder.length - 1}
                        style={{ ...navBtnStyle, opacity: currentIndex === weekOrder.length - 1 ? 0.3 : 1 }}
                    >
                        ▶️
                    </button>
                </div>

                {/* Preview */}
                <div style={previewStyle}>
                    <div
                        dangerouslySetInnerHTML={{ __html: s140HTML }}
                        style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '166%' }}
                    />
                </div>

                {/* Footer com botão ampliar */}
                <div style={{
                    padding: '8px 12px',
                    background: '#F3F4F6',
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid #E5E7EB'
                }}>
                    <button
                        onClick={() => setIsFullscreen(true)}
                        style={{
                            padding: '6px 16px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#4F46E5',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                        }}
                    >
                        🔍 Ampliar
                    </button>
                </div>
            </div>

            {/* Fullscreen Modal */}
            {isFullscreen && (
                <div style={fullscreenOverlay} onClick={() => setIsFullscreen(false)}>
                    <div style={fullscreenHeader} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button
                                onClick={goToPrev}
                                disabled={currentIndex === 0}
                                style={{ ...navBtnStyle, background: currentIndex === 0 ? '#374151' : '#4F46E5' }}
                            >
                                ◀️ Anterior
                            </button>
                            <span style={{ fontWeight: '600' }}>
                                {weekDisplay} ({currentIndex + 1}/{weekOrder.length})
                            </span>
                            <button
                                onClick={goToNext}
                                disabled={currentIndex === weekOrder.length - 1}
                                style={{ ...navBtnStyle, background: currentIndex === weekOrder.length - 1 ? '#374151' : '#4F46E5' }}
                            >
                                Próximo ▶️
                            </button>
                        </div>
                        <button
                            onClick={() => setIsFullscreen(false)}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '4px',
                                background: '#EF4444',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                            }}
                        >
                            ✕ Fechar
                        </button>
                    </div>
                    <div style={fullscreenContent} onClick={e => e.stopPropagation()}>
                        <div
                            dangerouslySetInnerHTML={{ __html: s140HTML }}
                            style={{ padding: '20px' }}
                        />
                    </div>
                </div>
            )}
        </>
    );
}

export default S140PreviewCarousel;
