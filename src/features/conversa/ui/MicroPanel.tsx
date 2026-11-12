import React from 'react';
import type { UpcomingAssignmentView } from '../ports/queryPort';
import type { ConversaCardData } from '../core/conversationState';
import { formatDateBr } from '../core/dateFormat';
import type { WorkbookPart } from '../../../types';

interface MicroPanelProps {
  cardData?: ConversaCardData;
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
    const items = (cardData.items || []) as UpcomingAssignmentView[];
    return (
      <div className="cv-card">
        <div className="cv-card-title">📅 {cardData.title}</div>
        <div className="cv-list">
          {items.map((item) => (
            <div key={item.partId} className="cv-list-item">
              <div>
                <strong>{formatDateBr(item.dateStr)}</strong> — {item.tipoParte}
                {item.partnerName && (
                  <div style={{ fontSize: '13px', opacity: 0.75 }}>
                    Com: {item.partnerName} ({item.role})
                  </div>
                )}
              </div>
              <span
                className={`cv-badge ${
                  ['confirmada', 'aprovada', 'designada', 'confirmed', 'concluida'].includes(
                    String(item.status || '').toLowerCase()
                  )
                    ? 'cv-badge-success'
                    : ['recusada', 'cancelada', 'refused'].includes(
                        String(item.status || '').toLowerCase()
                      )
                    ? 'cv-badge-danger'
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
    const items = (cardData.items || []) as WorkbookPart[];
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
    const items = (cardData.items || []) as WorkbookPart[];
    return (
      <div className="cv-card">
        <div className="cv-card-title">⏳ {cardData.title}</div>
        <div className="cv-list">
          {items.map((part) => (
            <div key={part.id} className="cv-list-item">
              <div>
                <div><strong>Semana {formatDateBr(part.weekId)}</strong> — {part.tipoParte}</div>
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

  // 5. Semanas Pendentes
  if (cardData.type === 'pending-weeks-list') {
    const items = (cardData.items || []) as Array<{ weekId: string }>;
    return (
      <div className="cv-card">
        <div className="cv-card-title">🗓️ {cardData.title}</div>
        <div className="cv-list">
          {items.map((item) => (
            <div key={item.weekId} className="cv-list-item">
              <div>
                <strong>Semana de {formatDateBr(item.weekId)}</strong>
              </div>
              <span className="cv-badge cv-badge-warning">Pendente</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. Resultado de Execução de Ação
  if (cardData.status === 'success' || cardData.status === 'error') {
    const isSuccess = cardData.status === 'success';
    return (
      <div
        className="cv-card"
        style={{
          borderColor: isSuccess ? 'var(--cv-success)' : 'var(--cv-danger)',
        }}
      >
        <div className="cv-card-title">
          {isSuccess ? '✅' : '❌'} {cardData.title || (isSuccess ? 'Concluído' : 'Erro')}
        </div>
        <p style={{ margin: '6px 0 0 0', fontSize: '15px' }}>{cardData.description}</p>
      </div>
    );
  }

  return (
    <div className="cv-card">
      <div className="cv-card-title">{cardData.title || 'Informações'}</div>
      <p style={{ margin: '6px 0 0 0', fontSize: '15px' }}>
        {cardData.description || JSON.stringify(cardData)}
      </p>
    </div>
  );
};
