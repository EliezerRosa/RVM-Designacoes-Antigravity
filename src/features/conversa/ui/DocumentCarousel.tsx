import React, { useState, useEffect } from 'react';
import type { DocumentCarouselItem } from '../ports/documentPort';

interface DocumentCarouselProps {
  items: DocumentCarouselItem[];
  initialFocusId?: string;
}

export const DocumentCarousel: React.FC<DocumentCarouselProps> = ({
  items,
  initialFocusId,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    if (initialFocusId) {
      const idx = items.findIndex((item) => item.id === initialFocusId);
      if (idx >= 0) {
        setCurrentIndex(idx);
        return;
      }
    }
    const defaultFocus = items.findIndex((item) => item.isInitialFocus);
    if (defaultFocus >= 0) {
      setCurrentIndex(defaultFocus);
    }
  }, [items, initialFocusId]);

  if (!items.length) {
    return (
      <div className="cv-card">
        <p style={{ margin: 0, color: 'var(--cv-text-muted)' }}>
          Nenhum documento disponível no momento.
        </p>
      </div>
    );
  }

  const current = items[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className={`cv-carousel ${isFullscreen ? 'cv-carousel-fullscreen' : ''}`}>
      {/* Barra Superior do Carrossel */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--cv-surface)',
          borderBottom: '1px solid var(--cv-border)',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>{current.title}</div>
          <div style={{ fontSize: '13px', color: 'var(--cv-text-muted)' }}>
            {current.subtitle}
          </div>
        </div>
        <button
          type="button"
          className="cv-icon-btn"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Sair da tela cheia' : 'Expandir tela cheia'}
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
      </div>

      {/* Área Central de Visualização */}
      <div className="cv-carousel-track">
        {current.imageBase64 ? (
          <img
            src={`data:image/png;base64,${current.imageBase64}`}
            alt={current.title}
            style={{
              maxWidth: '100%',
              maxHeight: isFullscreen ? '85vh' : '450px',
              objectFit: 'contain',
              borderRadius: '6px',
              boxShadow: 'var(--cv-shadow-sm)',
            }}
          />
        ) : current.htmlContent ? (
          <div
            style={{
              width: '100%',
              maxHeight: isFullscreen ? '85vh' : '450px',
              overflow: 'auto',
              background: '#ffffff',
              color: '#000000',
              padding: '12px',
              borderRadius: '6px',
            }}
            dangerouslySetInnerHTML={{ __html: current.htmlContent }}
          />
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--cv-text-muted)' }}>
            Visualização prévia não disponível.
          </div>
        )}
      </div>

      {/* Navegação Cronológica */}
      <div className="cv-carousel-nav">
        <button
          type="button"
          className="cv-icon-btn"
          onClick={handlePrev}
          title="Semana / Documento anterior"
          style={{ fontSize: '18px' }}
        >
          ◀
        </button>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>
          {currentIndex + 1} de {items.length} · {current.dateStr}
        </div>
        <button
          type="button"
          className="cv-icon-btn"
          onClick={handleNext}
          title="Próxima semana / Documento"
          style={{ fontSize: '18px' }}
        >
          ▶
        </button>
      </div>
    </div>
  );
};
