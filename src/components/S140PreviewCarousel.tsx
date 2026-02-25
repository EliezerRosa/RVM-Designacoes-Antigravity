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
import type { WorkbookPart, Publisher } from '../types';

interface Props {
    weekParts: Record<string, WorkbookPart[]>;  // weekId -> parts
    weekOrder: string[];  // Ordem das semanas
    publishers?: Publisher[]; // NEW: Lista de publicadores para resolver IDs
    // NEW: External control props
    currentWeekId?: string | null;
    onWeekChange?: (weekId: string) => void;
    onPartClick?: (partId: string) => void;
    selectedPartId?: string | null;
    onRequestS89?: () => void;
}

export function S140PreviewCarousel({ weekParts, weekOrder, publishers, currentWeekId, onWeekChange, onPartClick, selectedPartId, onRequestS89 }: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    // State for Async HTML Generation
    const [s140HTML, setS140HTML] = useState<string>('<div style="padding: 20px; color: #666;">Carregando visualização...</div>');
    const [isGenerating, setIsGenerating] = useState(false);

    // Sync with external control
    useEffect(() => {
        if (currentWeekId) {
            const index = weekOrder.indexOf(currentWeekId);
            if (index !== -1 && index !== currentIndex) {
                setCurrentIndex(index);
            }
        }
    }, [currentWeekId, weekOrder]);

    const activeWeekId = weekOrder[currentIndex] || '';
    const currentParts = weekParts[activeWeekId] || [];

    // Effect to Generate HTML (Async)
    useEffect(() => {
        let isMounted = true;

        const generateHTML = async () => {
            if (!activeWeekId || currentParts.length === 0) {
                if (isMounted) setS140HTML('<div style="padding: 20px; color: #666;">Sem partes para esta semana</div>');
                return;
            }

            setIsGenerating(true);
            try {
                // Import Dynamically
                const { prepareS140UnifiedData, renderS140ToElement } = await import('../services/s140GeneratorUnified');

                const weekData = await prepareS140UnifiedData(currentParts, publishers);
                const element = renderS140ToElement(weekData);

                if (isMounted) {
                    setS140HTML(element.outerHTML);
                }
            } catch (err) {
                console.error("Error generating S-140 preview:", err);
                if (isMounted) {
                    setS140HTML(`<div style="padding: 20px; color: #B91C1C;">Erro ao gerar preview: ${err}</div>`);
                }
            } finally {
                if (isMounted) setIsGenerating(false);
            }
        };

        generateHTML();

        return () => { isMounted = false; };
    }, [activeWeekId, currentParts]); // Re-run when week or parts change

    const [isFullscreen, setIsFullscreen] = useState(false);

    if (weekOrder.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
                Nenhuma semana para preview
            </div>
        );
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
        height: '280px',
        overflow: 'auto',
        background: 'white',
        padding: '10px',
        position: 'relative', // Para o loading overlay
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
                        <div style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <span>📄 S-140 B A4</span>
                            {onRequestS89 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRequestS89(); }}
                                    style={{
                                        background: '#22c55e',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                    title="Enviar S-89 desta semana"
                                >
                                    Zap 📤
                                </button>
                            )}
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
                    {isGenerating && (
                        <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(255,255,255,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10
                        }}>
                            <span style={{ color: '#4F46E5', fontWeight: '500' }}>Gerando visualização...</span>
                        </div>
                    )}
                    <div
                        dangerouslySetInnerHTML={{ __html: s140HTML }}
                        style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: '250%' }}
                    />
                </div>

                {/* Lista de partes clicáveis */}
                {onPartClick && (
                    <div style={{
                        maxHeight: '180px',
                        overflowY: 'auto',
                        borderTop: '1px solid #E5E7EB',
                        background: '#FAFAFA',
                    }}>
                        <div style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '600', color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>
                            📋 Partes desta semana (clique para selecionar)
                        </div>
                        {currentParts.map(part => (
                            <div
                                key={part.id}
                                onClick={() => onPartClick(part.id)}
                                style={{
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    borderBottom: '1px solid #E5E7EB',
                                    background: selectedPartId === part.id ? '#EEF2FF' : 'transparent',
                                    borderLeft: selectedPartId === part.id ? '3px solid #4F46E5' : '3px solid transparent',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span style={{ color: '#374151' }}>
                                    {part.tituloParte || part.tipoParte}
                                </span>
                                {part.resolvedPublisherName || part.rawPublisherName || '—'}
                            </div>
                        ))}
                    </div>
                )}

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
