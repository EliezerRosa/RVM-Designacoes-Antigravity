import React from 'react';
import type { UpcomingAssignmentView } from '../ports/queryPort';
import type { WorkbookPart } from '../../../types';

interface MicroPanelProps {
  cardData: any;
  onActionConfirm?: () => void;
  onActionCancel?: () => void;
}

export const MicroPanel: React.FC<MicroPanelProps> = ({
  cardData,
  onActionConfirm,
  onActionCancel,
}) => {
  if (!cardData) return null;

  // 1. Prévia de Ação (Confirmar / Cancelar)
  if (cardData.requiresConfirmation) {
    return (
      <div className="cv-card" style={{ borderColor: 'var(--cv-warning)' }}>
        <div className="cv-card-title">⚠️ {cardData.title}</div>
        <p style={{ margin: '8px 0 16px 0', fontSize: '16px' }}>{cardData.description}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="cv-send-btn"
            style={{ width: 'auto', padding: '10px 20px', borderRadius: '8px' }}
            onClick={onActionConfirm}
          >
            Confirmar
          </button>
          <button
            type="button"
            className="cv-choice-btn"
            style={{ padding: '10px 16px', borderRadius: '8px' }}
            onClick={onActionCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // 2. Lista de Designações de um Publicador
  if (cardData.type === 'assignments-list') {
    const items: UpcomingAssignmentView[] = cardData.items || [];
    return (
      <div className="cv-card">
        <div className="cv-card-title">📅 {cardData.title}</div>
        <div className="cv-list">
          {items.map((item) => (
            <div key={item.partId} className="cv-list-item">
              <div>
                <strong>{item.dateStr}</strong> — {item.tipoParte}
                {item.partnerName && (
                  <div style={{ fontSize: '13px', opacity: 0.75 }}>
                    Com: {item.partnerName} ({item.role})
                  </div>
                )}
              </div>
              <span
                className={`cv-badge ${
                  item.status === 'confirmada' || item.status === 'aprovada'
                    ? 'cv-badge-success'
                    : 'cv-badge-warning'
                }`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. Lista de Partes de uma Semana
  if (cardData.type === 'week-parts-list') {
    const items: WorkbookPart[] = cardData.items || [];
    return (
      <div className="cv-card">
        <div className="cv-card-title">📖 {cardData.title}</div>
        <div className="cv-list">
          {items.map((part) => (
            <div key={part.id} className="cv-list-item">
              <div>
                <div><strong>{part.tipoParte}</strong></div>
                <div style={{ fontSize: '14px', opacity: 0.85 }}>
                  {part.resolvedPublisherName || part.rawPublisherName || 'Não designado'}
                </div>
              </div>
              <span className="cv-badge cv-badge-primary">
                {part.status || 'pendente'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4. Partes Vagas / Pendentes
  if (cardData.type === 'vacant-parts-list') {
    const items: WorkbookPart[] = cardData.items || [];
    return (
      <div className="cv-card">
        <div className="cv-card-title">⏳ {cardData.title}</div>
        <div className="cv-list">
          {items.map((part) => (
            <div key={part.id} className="cv-list-item">
              <div>
                <div><strong>Semana {part.weekId}</strong> — {part.tipoParte}</div>
                {part.tituloParte && (
                  <div style={{ fontSize: '13px', opacity: 0.75 }}>{part.tituloParte}</div>
                )}
              </div>
              <span className="cv-badge cv-badge-warning">Vaga</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cv-card">
      <div className="cv-card-title">{cardData.title || 'Informações'}</div>
      <p>{cardData.description || JSON.stringify(cardData)}</p>
    </div>
  );
};
