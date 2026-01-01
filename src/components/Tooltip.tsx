/**
 * Tooltip Component - Posicionamento dinâmico para não ser cortado
 * Usa position:fixed e calcula posição baseada na viewport
 * COMPORTAMENTO: Click toggle (clique para abrir, clique novamente para fechar)
 */

import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react';

interface TooltipProps {
    content: ReactNode;
    children: ReactNode;
    /** Estilo adicional para o ícone/trigger */
    triggerStyle?: CSSProperties;
    /** Classe adicional para o trigger */
    triggerClassName?: string;
}

export function Tooltip({ content, children, triggerStyle, triggerClassName }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLSpanElement>(null);

    const calculatePosition = useCallback(() => {
        if (!triggerRef.current) return;

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipWidth = 280; // Estimativa - será ajustado após render
        const tooltipHeight = 100; // Estimativa inicial
        const padding = 12; // Margem das bordas da viewport

        // Posição preferencial: acima e centralizado
        let top = triggerRect.top - tooltipHeight - 8;
        let left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);

        // Ajustar se sair pela esquerda
        if (left < padding) {
            left = padding;
        }

        // Ajustar se sair pela direita
        if (left + tooltipWidth > window.innerWidth - padding) {
            left = window.innerWidth - tooltipWidth - padding;
        }

        // Se não couber acima, mostrar abaixo
        if (top < padding) {
            top = triggerRect.bottom + 8;
        }

        // Atualizar após tooltip renderizar para usar dimensões reais
        if (tooltipRef.current) {
            const actualRect = tooltipRef.current.getBoundingClientRect();
            if (actualRect.width > 0 && actualRect.height > 0) {
                // Recalcular com dimensões reais
                const actualTop = triggerRect.top - actualRect.height - 8;
                const actualLeft = triggerRect.left + (triggerRect.width / 2) - (actualRect.width / 2);

                // Ajustes finais
                let finalLeft = actualLeft;
                let finalTop = actualTop;

                if (finalLeft < padding) finalLeft = padding;
                if (finalLeft + actualRect.width > window.innerWidth - padding) {
                    finalLeft = window.innerWidth - actualRect.width - padding;
                }
                if (finalTop < padding) {
                    finalTop = triggerRect.bottom + 8;
                }

                setPosition({ top: finalTop, left: finalLeft });
                return;
            }
        }

        setPosition({ top, left });
    }, []);

    // Click toggle handler
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); // Evitar propagação do click
        setIsVisible(prev => {
            const newVisible = !prev;
            if (newVisible) {
                // Calcular posição ao abrir
                requestAnimationFrame(calculatePosition);
            }
            return newVisible;
        });
    }, [calculatePosition]);

    // Fechar ao clicar fora
    useEffect(() => {
        if (!isVisible) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setIsVisible(false);
            }
        };

        // Fechar ao scrollar
        const handleScroll = () => {
            setIsVisible(false);
        };

        document.addEventListener('click', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('click', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isVisible]);

    // Recalcular posição quando visível
    useEffect(() => {
        if (isVisible) {
            calculatePosition();
            requestAnimationFrame(calculatePosition);
        }
    }, [isVisible, calculatePosition]);

    return (
        <span
            ref={triggerRef}
            className={triggerClassName}
            style={{ ...triggerStyle, position: 'relative', display: 'inline-flex', cursor: 'pointer' }}
            onClick={handleClick}
        >
            {children}
            {isVisible && (
                <span
                    ref={tooltipRef}
                    className="tooltip-content-fixed"
                    style={{
                        position: 'fixed',
                        top: position.top,
                        left: position.left,
                        visibility: 'visible',
                        opacity: 1,
                        zIndex: 99999,
                        // Estilos visuais
                        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                        color: '#f9fafb',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: 500,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-line',
                        textAlign: 'left',
                        minWidth: '220px',
                        maxWidth: 'min(320px, calc(100vw - 40px))',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3), 0 4px 10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'auto', // Permitir interação com o tooltip
                    }}
                    onClick={(e) => e.stopPropagation()} // Evitar fechar ao clicar no tooltip
                >
                    {content}
                </span>
            )}
        </span>
    );
}

export default Tooltip;
