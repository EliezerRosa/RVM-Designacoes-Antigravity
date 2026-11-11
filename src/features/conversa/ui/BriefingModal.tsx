import React from 'react';
import type { UserBriefingData } from '../ports/briefingPort';

interface BriefingModalProps {
  briefing: UserBriefingData;
  onClose: () => void;
  onConfirmAssignment?: (partId: string) => void;
  onRefuseAssignment?: (partId: string) => void;
}

export const BriefingModal: React.FC<BriefingModalProps> = ({
  briefing,
  onClose,
  onConfirmAssignment,
  onRefuseAssignment,
}) => {
  return (
    <div className="cv-modal-backdrop" onClick={onClose}>
      <div className="cv-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="cv-modal-header">
          <h3>🔔 Suas Pendências & Próximos Eventos</h3>
          <button
            type="button"
            className="cv-icon-btn"
            onClick={onClose}
            aria-label="Fechar"
            style={{ fontSize: '20px' }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--cv-text-muted)' }}>
          {briefing.writtenGreeting}
        </p>

        {/* 1. Designações a Confirmar */}
        {briefing.assignmentsToConfirm.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--cv-warning)', marginBottom: '8px' }}>
              ⏳ AGUARDANDO SUA CONFIRMAÇÃO:
            </div>
            <div className="cv-list">
              {briefing.assignmentsToConfirm.map((item) => (
                <div key={item.partId} className="cv-list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <strong>{item.dateStr}</strong> — {item.tipoParte}
                    {item.partnerName && (
                      <span style={{ fontSize: '13px', opacity: 0.75 }}> (com {item.partnerName})</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      type="button"
                      className="cv-send-btn"
                      style={{ fontSize: '14px', height: '36px', borderRadius: '6px', padding: '0 14px', width: 'auto' }}
                      onClick={() => onConfirmAssignment && onConfirmAssignment(item.partId)}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      className="cv-choice-btn"
                      style={{ fontSize: '14px', padding: '6px 12px', borderRadius: '6px' }}
                      onClick={() => onRefuseAssignment && onRefuseAssignment(item.partId)}
                    >
                      Não poderei
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. Próximas Designações a Cumprir */}
        {briefing.assignmentsToFulfill.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--cv-success)', marginBottom: '8px' }}>
              ✅ PRÓXIMAS DESIGNAÇÕES A CUMPRIR:
            </div>
            <div className="cv-list">
              {briefing.assignmentsToFulfill.map((item) => (
                <div key={item.partId} className="cv-list-item">
                  <div>
                    <strong>{item.dateStr}</strong> — {item.tipoParte}
                  </div>
                  <span className="cv-badge cv-badge-success">Confirmada</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Eventos Futuros */}
        {briefing.upcomingEvents.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--cv-primary)', marginBottom: '8px' }}>
              📅 PRÓXIMOS EVENTOS:
            </div>
            <div className="cv-list">
              {briefing.upcomingEvents.map((ev) => (
                <div key={ev.id} className="cv-list-item">
                  <div>
                    <strong>{ev.name}</strong>
                  </div>
                  <span style={{ fontSize: '13px', opacity: 0.8 }}>
                    {ev.startDate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="cv-send-btn"
          style={{ width: '100%', borderRadius: '10px', height: '44px', fontSize: '16px' }}
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </div>
  );
};
