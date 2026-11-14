import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import type { DocumentCarouselItem } from '../ports/documentPort';
import { formatDateBr } from '../core/dateFormat';

interface DocumentCarouselProps {
  items: DocumentCarouselItem[];
  initialFocusId?: string;
  selfPublisherId?: string | null;
  onConfirmAssignment?: (partId: string) => void | Promise<void>;
  onRefuseAssignment?: (partId: string, reason?: string) => void | Promise<void>;
}

interface StageFitMetrics {
  availW: number;
  availH: number;
  scale: number;
  scaledW: number;
  scaledH: number;
}

function getDefaultFormWidth(docType: DocumentCarouselItem['docType']): number {
  switch (docType) {
    case 's140':
    case 's1':
      return 800;
    case 's4':
      return 480;
    case 's89':
      return 460;
    default:
      return 680;
  }
}

function resolveInitialIndex(items: DocumentCarouselItem[], initialFocusId?: string): number {
  if (!items.length) return 0;
  if (initialFocusId) {
    const idx = items.findIndex((item) => item.id === initialFocusId);
    if (idx >= 0) return idx;
  }
  const defaultFocus = items.findIndex((item) => item.isInitialFocus);
  return defaultFocus >= 0 ? defaultFocus : 0;
}

export const DocumentCarousel: React.FC<DocumentCarouselProps> = ({
  items,
  initialFocusId,
  selfPublisherId,
  onConfirmAssignment,
  onRefuseAssignment,
}) => {
  const itemsSignature = `${initialFocusId || ''}|${items.map((i) => i.id).join(',')}`;
  const [selection, setSelection] = useState<{ sig: string; index: number }>(() => ({
    sig: itemsSignature,
    index: resolveInitialIndex(items, initialFocusId),
  }));
  const [closedSig, setClosedSig] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imgMeta, setImgMeta] = useState<{ id: string; w: number; h: number } | null>(null);
  const [partResponses, setPartResponses] = useState<Record<string, 'confirmed' | 'refused'>>({});
  const [busyAction, setBusyAction] = useState<'confirm' | 'refuse' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fit, setFit] = useState<StageFitMetrics>({
    availW: 640,
    availH: 520,
    scale: 1,
    scaledW: 0,
    scaledH: 0,
  });

  const trackRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = useRef(false);

  const isOpen = closedSig !== itemsSignature;

  const activeIndex =
    selection.sig === itemsSignature
      ? selection.index
      : resolveInitialIndex(items, initialFocusId);

  const safeIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  const current = items[safeIndex];
  const hasMultiple = items.length > 1;
  const imgNatural = imgMeta && current && imgMeta.id === current.id ? imgMeta : null;

  const handleDismiss = useCallback(() => {
    setIsFullscreen(false);
    setClosedSig(itemsSignature);
  }, [itemsSignature]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setActionError(null);
    setSelection((prev) => {
      const cur = prev.sig === itemsSignature ? prev.index : resolveInitialIndex(items, initialFocusId);
      const next = cur > 0 ? cur - 1 : items.length - 1;
      return { sig: itemsSignature, index: next };
    });
  }, [items, initialFocusId, itemsSignature]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setActionError(null);
    setSelection((prev) => {
      const cur = prev.sig === itemsSignature ? prev.index : resolveInitialIndex(items, initialFocusId);
      const next = cur < items.length - 1 ? cur + 1 : 0;
      return { sig: itemsSignature, index: next };
    });
  }, [items, initialFocusId, itemsSignature]);

  const recomputeFit = useCallback(() => {
    if (typeof window === 'undefined' || !current || !isOpen) return;

    const vw = window.visualViewport?.width || window.innerWidth || 720;
    const vh = window.visualViewport?.height || window.innerHeight || 800;

    let availW = Math.min(vw - 36, 660);
    let availH: number;

    const trackEl = trackRef.current;
    if (trackEl) {
      const cs = window.getComputedStyle(trackEl);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const measuredW = trackEl.clientWidth - padX;
      if (measuredW > 20) {
        availW = measuredW;
      }
      if (isFullscreen) {
        const measuredH = trackEl.clientHeight - padY;
        availH = measuredH > 60 ? measuredH : Math.max(220, vh - 120);
      } else if (vh <= 480) {
        // Celular em paisagem
        availH = Math.max(180, vh - 155);
      } else if (vw <= 640) {
        // Celular em retrato
        availH = Math.max(260, Math.min(vh - 185, 620));
      } else {
        // Tablet / Desktop flutuante
        availH = Math.max(300, Math.min(vh - 230, 660));
      }
    } else {
      availH = isFullscreen ? Math.max(240, vh - 120) : Math.max(280, Math.min(vh - 220, 620));
    }

    const baseWidth = current.naturalWidth || getDefaultFormWidth(current.docType);
    const canvasEl = canvasRef.current;

    if (canvasEl && !current.imageBase64) {
      const naturalH = canvasEl.scrollHeight;
      const naturalW = Math.max(baseWidth, canvasEl.scrollWidth || baseWidth);

      if (naturalH > 0 && availW > 0) {
        const maxScale = isFullscreen ? 1.35 : 1.0;
        const nextScale = Math.min(availW / naturalW, availH / naturalH, maxScale);
        const scaledW = Math.max(1, Math.round(naturalW * nextScale));
        const scaledH = Math.max(1, Math.round(naturalH * nextScale));

        setFit((prev) =>
          prev.availW === availW &&
          prev.availH === availH &&
          Math.abs(prev.scale - nextScale) < 0.002 &&
          prev.scaledW === scaledW &&
          prev.scaledH === scaledH
            ? prev
            : { availW, availH, scale: nextScale, scaledW, scaledH }
        );
        return;
      }
    }

    setFit((prev) =>
      prev.availW === availW && prev.availH === availH && prev.scaledH === 0
        ? prev
        : { availW, availH, scale: 1, scaledW: 0, scaledH: 0 }
    );
  }, [current, isFullscreen, isOpen]);

  useLayoutEffect(() => {
    recomputeFit();
  }, [recomputeFit, current?.id, current?.htmlContent, isFullscreen, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    recomputeFit();

    const onViewportChange = () => recomputeFit();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recomputeFit());
      if (trackRef.current) ro.observe(trackRef.current);
      if (canvasRef.current) ro.observe(canvasRef.current);
    }

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      ro?.disconnect();
    };
  }, [recomputeFit, current?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          handleDismiss();
        }
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isFullscreen, handleDismiss, handlePrev, handleNext]);

  if (!items.length || !current) {
    return (
      <div className="cv-card">
        <p style={{ margin: 0, color: 'var(--cv-text-muted)' }}>
          Nenhum documento disponível no momento.
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="cv-carousel-reopen-bar">
        <button
          type="button"
          className="cv-carousel-reopen-btn"
          onClick={() => setClosedSig(null)}
        >
          📄 Exibir no carrossel ({items.length})
        </button>
      </div>
    );
  }

  const effectivePartId =
    current.partId || (current.docType === 's89' ? current.id.replace(/^s89-/, '') : '');
  const isOwnS89 =
    current.docType === 's89' &&
    Boolean(
      current.isSelfAssignment ||
        (selfPublisherId && current.publisherId && current.publisherId === selfPublisherId)
    );
  const localResp = effectivePartId ? partResponses[effectivePartId] : undefined;
  const effectiveResp =
    localResp ||
    current.portalResponse ||
    (current.isRefused ? 'refused' : current.isConfirmed ? 'confirmed' : undefined);
  const isAlreadyConfirmed = effectiveResp === 'confirmed';
  const isAlreadyRefused = effectiveResp === 'refused';
  const showS89Actions = Boolean(
    isOwnS89 && effectivePartId && (onConfirmAssignment || onRefuseAssignment)
  );

  const handleConfirmS89 = async () => {
    if (!effectivePartId || !onConfirmAssignment || busyAction) return;
    setBusyAction('confirm');
    setActionError(null);
    try {
      await onConfirmAssignment(effectivePartId);
      setPartResponses((prev) => ({ ...prev, [effectivePartId]: 'confirmed' }));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Falha ao confirmar a designação.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefuseS89 = async () => {
    if (!effectivePartId || !onRefuseAssignment || busyAction) return;
    setBusyAction('refuse');
    setActionError(null);
    try {
      await onRefuseAssignment(
        effectivePartId,
        'Não poderei realizar a designação (informado via S-89).'
      );
      setPartResponses((prev) => ({ ...prev, [effectivePartId]: 'refused' }));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Falha ao registrar indisponibilidade.');
    } finally {
      setBusyAction(null);
    }
  };

  const baseFormWidth = current.naturalWidth || getDefaultFormWidth(current.docType);

  const computedImageStyle = (): React.CSSProperties => {
    if (imgNatural && imgNatural.w > 0 && imgNatural.h > 0 && fit.availW > 0 && fit.availH > 0) {
      const maxScale = isFullscreen ? 1.35 : 1.0;
      const s = Math.min(fit.availW / imgNatural.w, fit.availH / imgNatural.h, maxScale);
      return {
        width: `${Math.max(1, Math.round(imgNatural.w * s))}px`,
        height: `${Math.max(1, Math.round(imgNatural.h * s))}px`,
        maxWidth: `${fit.availW}px`,
        maxHeight: `${fit.availH}px`,
      };
    }
    return {
      maxWidth: `${fit.availW}px`,
      maxHeight: `${fit.availH}px`,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    didSwipeRef.current = false;
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!hasMultiple || !touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      didSwipeRef.current = true;
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  const isCompactDoc = current.docType === 's89' || current.docType === 's4';

  return (
    <div
      className="cv-carousel-backdrop"
      onClick={handleDismiss}
      data-testid="carousel-backdrop"
    >
      <div
        className={`cv-carousel cv-carousel-floating ${
          isCompactDoc ? 'cv-carousel-compact' : ''
        } ${isFullscreen ? 'cv-carousel-fullscreen' : ''}`}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleContainerKeyDown}
        aria-label={current.title}
      >
        {/* Barra Superior Limpa */}
        <div className="cv-carousel-header">
          <div className="cv-carousel-meta">
            <div className="cv-carousel-title" title={current.title}>
              {current.title}
            </div>
            {current.subtitle && (
              <div className="cv-carousel-subtitle" title={current.subtitle}>
                {current.subtitle}
              </div>
            )}
          </div>
          <div className="cv-carousel-header-actions">
            <button
              type="button"
              className="cv-icon-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Sair da tela cheia' : 'Expandir tela cheia'}
              aria-label={isFullscreen ? 'Sair da tela cheia' : 'Expandir tela cheia'}
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>
            <button
              type="button"
              className="cv-icon-btn"
              onClick={handleDismiss}
              title="Fechar carrossel"
              aria-label="Fechar carrossel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Palco Auto-Ajustado ao Dispositivo (zero barras de rolagem) */}
        <div
          ref={trackRef}
          className="cv-carousel-track"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            if (didSwipeRef.current) {
              didSwipeRef.current = false;
              return;
            }
            if (e.target === e.currentTarget) {
              handleDismiss();
            }
          }}
        >
          {current.imageBase64 ? (
            <img
              src={`data:image/png;base64,${current.imageBase64}`}
              alt={current.title}
              className="cv-form-image"
              style={computedImageStyle()}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setImgMeta({ id: current.id, w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
            />
          ) : current.htmlContent ? (
            <div
              className="cv-form-frame"
              style={
                fit.scaledH > 0
                  ? {
                      width: `${fit.scaledW}px`,
                      height: `${fit.scaledH}px`,
                    }
                  : {
                      width: '100%',
                      height: 'auto',
                    }
              }
            >
              <div
                ref={canvasRef}
                className="cv-form-canvas"
                style={
                  fit.scaledH > 0
                    ? {
                        width: `${baseFormWidth}px`,
                        transform: `scale(${fit.scale})`,
                      }
                    : {
                        width: '100%',
                      }
                }
                dangerouslySetInnerHTML={{ __html: current.htmlContent }}
              />
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--cv-text-muted)' }}>
              Visualização prévia não disponível.
            </div>
          )}
        </div>

        {/* Botões Z-API do S-89 (Exclusivo para S-89 do publicador logado) */}
        {showS89Actions && (
          <div className="cv-carousel-s89-actions">
            {actionError && <div className="cv-carousel-s89-error">{actionError}</div>}
            {isAlreadyRefused ? (
              <div className="cv-carousel-s89-status cv-carousel-s89-status-refused">
                ❌ Indisponibilidade registrada
              </div>
            ) : (
              <div className="cv-carousel-s89-btn-row">
                {!isAlreadyConfirmed && onConfirmAssignment ? (
                  <button
                    type="button"
                    className="cv-s89-btn cv-s89-btn-confirm"
                    data-testid="s89-confirm-btn"
                    disabled={busyAction !== null}
                    onClick={() => void handleConfirmS89()}
                  >
                    {busyAction === 'confirm' ? '⏳ Confirmando...' : '✅ Confirmar'}
                  </button>
                ) : isAlreadyConfirmed ? (
                  <span className="cv-carousel-s89-status cv-carousel-s89-status-confirmed">
                    ✅ Confirmado
                  </span>
                ) : null}

                {onRefuseAssignment && (
                  <button
                    type="button"
                    className="cv-s89-btn cv-s89-btn-refuse"
                    data-testid="s89-refuse-btn"
                    disabled={busyAction !== null}
                    onClick={() => void handleRefuseS89()}
                  >
                    {busyAction === 'refuse' ? '⏳ Registrando...' : '❌ Não Poderei'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navegação Cronológica */}
        <div className="cv-carousel-nav">
          <button
            type="button"
            className="cv-icon-btn"
            onClick={handlePrev}
            disabled={!hasMultiple}
            title="Semana / Documento anterior"
            aria-label="Semana ou documento anterior"
            style={{ fontSize: '17px' }}
          >
            ◀
          </button>
          <div className="cv-carousel-counter">
            {safeIndex + 1} de {items.length} · {formatDateBr(current.dateStr)}
          </div>
          <button
            type="button"
            className="cv-icon-btn"
            onClick={handleNext}
            disabled={!hasMultiple}
            title="Próxima semana / Documento"
            aria-label="Próxima semana ou documento"
            style={{ fontSize: '17px' }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};
