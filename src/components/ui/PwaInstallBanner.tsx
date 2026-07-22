/**
 * PwaInstallBanner.tsx — Banner inteligente e não-intrusivo para instalação do App PWA (Android, iOS e Desktop)
 */

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isIos, setIsIos] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [showBanner, setShowBanner] = useState(false);
    const [showIosModal, setShowIosModal] = useState(false);

    useEffect(() => {
        // Verifica se já está rodando como PWA standalone
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
        if (isStandalone) {
            setIsInstalled(true);
            return;
        }

        // Detecta iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const iosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIos(iosDevice);

        // Ocultado se dispensado recentemente (localStorage)
        const dismissed = localStorage.getItem('rvm_pwa_banner_dismissed');
        if (dismissed) {
            const dismissedTime = parseInt(dismissed, 10);
            if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) { // 7 dias de cooldown
                return;
            }
        }

        // Listener do evento nativo do Android/Chrome
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setShowBanner(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Se for iOS e não instalado, exibe opção do banner
        if (iosDevice && !isStandalone) {
            setShowBanner(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsInstalled(true);
                setShowBanner(false);
            }
            setDeferredPrompt(null);
        } else if (isIos) {
            setShowIosModal(true);
        }
    };

    const handleDismiss = () => {
        setShowBanner(false);
        localStorage.setItem('rvm_pwa_banner_dismissed', Date.now().toString());
    };

    if (isInstalled || !showBanner) return null;

    return (
        <>
            <div style={bannerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={iconBadgeStyle}>📱</div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Instalar App RVM Designações
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                            {isIos ? 'Adicione à tela de início para acesso rápido' : 'Acesse em tela cheia com 1 toque'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button onClick={handleInstallClick} style={btnInstallStyle}>
                        📲 Instalar
                    </button>
                    <button onClick={handleDismiss} style={btnCloseStyle} title="Lembrar mais tarde">
                        ✕
                    </button>
                </div>
            </div>

            {/* Modal de ajuda para iOS Safari */}
            {showIosModal && (
                <div style={modalOverlayStyle} onClick={() => setShowIosModal(false)}>
                    <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🍏</div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
                            Como instalar no iPhone / iPad
                        </h3>
                        <ol style={{ textAlign: 'left', margin: '16px 0', paddingLeft: '24px', fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                            <li>No Safari, toque no botão <strong>Compartilhar</strong> <span style={{ fontSize: '1.2rem' }}>⎋</span> (na barra inferior).</li>
                            <li>Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong> ➕.</li>
                            <li>Toque em <strong>Adicionar</strong> no canto superior direito.</li>
                        </ol>
                        <button onClick={() => setShowIosModal(false)} style={btnInstallStyle}>
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

const bannerStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 9990,
    background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)',
    borderBottom: '1px solid rgba(99, 102, 241, 0.4)',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const iconBadgeStyle: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    flexShrink: 0,
};

const btnInstallStyle: React.CSSProperties = {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 14px',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
};

const btnCloseStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#94a3b8',
    border: 'none',
    fontSize: '1rem',
    padding: '4px 8px',
    cursor: 'pointer',
};

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
};

const modalContentStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
};
