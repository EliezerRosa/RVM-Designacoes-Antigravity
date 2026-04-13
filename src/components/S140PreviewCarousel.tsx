/**
 * S140PreviewCarousel - Carrossel de previews S-140 B A4
 * 
 * Exibe um carrossel horizontal com previews do S-140 para cada semana.
 * Features:
 * - Navegação com setas ◀️ ▶️
 * - Botão para ampliar em fullscreen
 * - Renderiza HTML inline do S-140
 */

import { useState, useEffect, useRef } from 'react';
import type { WorkbookPart, Publisher } from '../types';

interface Props {
    weekParts: Record<string, WorkbookPart[]>;  // weekId -> parts
    weekOrder: string[];  // Ordem das semanas
    publishers?: Publisher[]; // NEW: Lista de publicadores para resolver IDs
    // NEW: External control props
    currentWeekId?: string | null;
    onWeekChange?: (weekId: string) => void;
    onRequestS89?: () => void;
}

export function S140PreviewCarousel({ weekParts, weekOrder, publishers, currentWeekId, onWeekChange, onRequestS89 }: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    // State for Async HTML Generation
    const [s140HTML, setS140HTML] = useState<string>('<div style="padding: 20px; color: #666;">Carregando visualização...</div>');
    const [isGenerating, setIsGenerating] = useState(false);
    const [scale, setScale] = useState(0.45);
    const [contentHeight, setContentHeight] = useState(1123);

    // Sync scaling using ResizeObserver to ensure it fits any mobile or PC screen perfectly
    // Observe the preview area to get both available width and height.
    const previewRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);

    // Calculate height occasionally if content changes
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(Math.max(1123, contentRef.current.scrollHeight));
        }
    }, [s140HTML, scale]);

    const setPreviewRef = (element: HTMLDivElement | null) => {
        previewRef.current = element;

        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        if (element) {
            observerRef.current = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const availW = entry.contentRect.width - 20; // minus padding
                    const availH = entry.contentRect.height - 20;
                    const wScale = availW / 794;
                    const hScale = availH / contentHeight;
                    setScale(Math.min(wScale, hScale));
                }
            });
            observerRef.current.observe(element);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, []);

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
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
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
        flex: 1, // Preencher toda a coluna
        overflow: 'hidden', // No scrollbar — scale fits everything
        background: 'white',
        padding: '10px',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
    };

    return (
        <div style={containerStyle} >
            {/* Header com navegação */}
            < div style={headerStyle} >
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
            </div >

            {/* Preview — ocupa toda a área disponível */}
            < div style={previewStyle} ref={setPreviewRef} >
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
                )
                }
                <div
                    style={{
                        width: '100%',
                        maxWidth: '794px', // Limit to max original size
                        height: `${contentHeight * scale}px`, // Dynamically calculated exact height!
                        overflow: 'hidden',
                        background: 'white',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        margin: '0 auto',
                        position: 'relative',
                        transition: 'height 0.2s ease-in-out'
                    }}>
                    <div
                        ref={contentRef}
                        dangerouslySetInnerHTML={{ __html: s140HTML }}
                        style={{
                            width: '794px',
                            minHeight: '1123px',
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            background: 'white',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }}
                    />
                </div>
            </div >
        </div >
    );
}

export default S140PreviewCarousel;
