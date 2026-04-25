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
                    background: '#0F172A', borderRadius: isFullscreen ? 0 : '12px',
                    padding: '16px', maxWidth: '1280px', width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'white', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>
                        🎬 Vídeo-tutorial completo
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#94A3B8', marginRight: '4px' }}>Velocidade:</span>
                        {SPEEDS.map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                style={{
                                    background: speed === s ? '#0EA5E9' : '#1E293B',
                                    color: 'white', border: '1px solid #334155',
                                    borderRadius: '6px', padding: '4px 10px',
                                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                    minWidth: '38px',
                                }}
                            >
                                {s}×
                            </button>
                        ))}
                        <button
                            onClick={toggleFs}
                            title={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
                            style={{
                                background: '#7C3AED', color: 'white', border: 'none',
                                borderRadius: '6px', padding: '4px 10px',
                                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                marginLeft: '6px',
                            }}
                        >
                            {isFullscreen ? '🗗 Restaurar' : '⛶ Maximizar'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: '#EF4444', color: 'white', border: 'none',
                                borderRadius: '6px', padding: '4px 12px',
                                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
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
                        height: isFullscreen ? 'calc(100vh - 90px)' : 'auto',
                        maxHeight: '85vh',
                        borderRadius: '8px', display: 'block', background: '#000',
                        objectFit: 'contain',
                    }}
                >
                    Seu navegador não suporta vídeo HTML5.
                </video>
                <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                    Cobre os três tutoriais guiados: Status do Publicador, Necessidades Locais e Eventos Especiais.
                </div>
            </div>
        </div>
    );
}
