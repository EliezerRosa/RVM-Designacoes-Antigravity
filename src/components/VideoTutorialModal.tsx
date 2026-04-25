/**
 * VideoTutorialModal — modal full-screen para o vídeo-tutorial.
 *
 * Recursos:
 *   • Fullscreen automático ao abrir.
 *   • Áudio narrado embutido (TTS pt-BR).
 *   • Controles nativos com download desabilitado (controlsList="nodownload").
 *   • Botões custom para velocidade: 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×.
 *   • Botão custom para alternar fullscreen.
 *   • Click fora ou ESC fecha.
 */

import { useEffect, useRef, useState } from 'react';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Props {
    onClose: () => void;
    src?: string;
}

export function VideoTutorialModal({ onClose, src = '/tutorial_completo.mp4' }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [speed, setSpeed] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ESC fecha
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !document.fullscreenElement) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Tenta entrar em fullscreen ao abrir
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Pequeno delay para o vídeo começar a tocar antes
        const t = setTimeout(() => {
            if (el.requestFullscreen) {
                el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {/* user gesture? */});
            }
        }, 200);
        return () => clearTimeout(t);
    }, []);

    // Atualiza speed no <video>
    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = speed;
    }, [speed]);

    // Listener de mudança de fullscreen
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const toggleFs = async () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await el.requestFullscreen();
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.92)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 9500,
                padding: '20px',
            }}
        >
            <div
                ref={containerRef}
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0F172A', borderRadius: isFullscreen ? 0 : '14px',
                    padding: '18px', maxWidth: '1280px', width: '100%',
                    boxShadow: '0 25px 70px rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column', gap: '14px',
                }}
            >
                <div
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        color: 'white', flexWrap: 'wrap', gap: '12px',
                        background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                        border: '1px solid #334155',
                        borderRadius: '12px', padding: '12px 16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '0.2px' }}>
                        🎬 Vídeo-tutorial completo
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: '#CBD5E1', marginRight: '6px', fontWeight: 600 }}>
                            Velocidade:
                        </span>
                        {SPEEDS.map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                style={{
                                    background: speed === s
                                        ? 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)'
                                        : '#1E293B',
                                    color: 'white',
                                    border: speed === s ? '1px solid #38BDF8' : '1px solid #475569',
                                    borderRadius: '8px', padding: '7px 14px',
                                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                    minWidth: '46px',
                                    boxShadow: speed === s ? '0 2px 8px rgba(14,165,233,0.5)' : 'none',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {s}×
                            </button>
                        ))}
                        <button
                            onClick={toggleFs}
                            title={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
                            style={{
                                background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                                color: 'white', border: '1px solid #8B5CF6',
                                borderRadius: '8px', padding: '7px 14px',
                                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                marginLeft: '8px',
                                boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
                            }}
                        >
                            {isFullscreen ? '🗗 Restaurar' : '⛶ Maximizar'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                color: 'white', border: '1px solid #F87171',
                                borderRadius: '8px', padding: '7px 16px',
                                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                            }}
                        >
                            ✕ Fechar
                        </button>
                    </div>
                </div>
                <video
                    ref={videoRef}
                    src={src}
                    controls
                    autoPlay
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={e => e.preventDefault()}
                    style={{
                        width: '100%',
                        height: isFullscreen ? 'calc(100vh - 130px)' : 'auto',
                        maxHeight: '82vh',
                        borderRadius: '10px', display: 'block', background: '#000',
                        objectFit: 'contain',
                        border: '1px solid #1E293B',
                    }}
                >
                    Seu navegador não suporta vídeo HTML5.
                </video>
                <div style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', fontWeight: 500 }}>
                    Cobre os três tutoriais guiados: Status do Publicador, Necessidades Locais e Eventos Especiais.
                </div>
            </div>
        </div>
    );
}
