import React, { useState } from 'react';
import type { UserBriefingData } from '../ports/briefingPort';
import { formatDateBr } from '../core/dateFormat';

interface BriefingModalProps {
  briefing: UserBriefingData;
  onClose: () => void;
  onConfirmAssignment?: (partId: string) => void | Promise<void>;
  onRefuseAssignment?: (partId: string, reason: string) => void | Promise<void>;
}

export const BriefingModal: React.FC<BriefingModalProps> = ({
  briefing,
  onClose,
  onConfirmAssignment,
  onRefuseAssignment,
}) => {
  const [busyPartId, setBusyPartId] = useState<string | null>(null);
  const [refusingPartId, setRefusingPartId] = useState<string | null>(null);
  const [refusalReason, setRefusalReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConfirm = async (partId: string) => {
    if (!onConfirmAssignment) return;
    setBusyPartId(partId);
    setActionError(null);
    try {
      await onConfirmAssignment(partId);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível confirmar a designação.');
    } finally {
      setBusyPartId(null);
    }
  };

  const handleConfirmRefusal = async (partId: string) => {
    if (!onRefuseAssignment) return;
    const cleanReason = refusalReason.trim() || 'Indisponibilidade informada pelo publicador';
    setBusyPartId(partId);
    setActionError(null);
    try {
      await onRefuseAssignment(partId, cleanReason);
      setRefusingPartId(null);
      setRefusalReason('');
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível registrar a recusa.');
    } finally {
      setBusyPartId(null);
    }
  };

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

        {actionError && <div className="cv-inline-error">{actionError}</div>}

        {/* 1. Designações a Confirmar */}
        {briefing.assignmentsToConfirm.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--cv-warning)', marginBottom: '8px' }}>
              ⏳ AGUARDANDO SUA CONFIRMAÇÃO:
            </div>
            <div className="cv-list">
              {briefing.assignmentsToConfirm.map((item) => {
                const isBusy = busyPartId === item.partId;
                const isRefusingThis = refusingPartId === item.partId;

                return (
                  <div
                    key={item.partId}
                    className="cv-list-item"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}
                  >
                    <div>
                      <strong>{formatDateBr(item.dateStr)}</strong> — {item.tipoParte}
                      {item.partnerName && (
                        <span style={{ fontSize: '13px', opacity: 0.75 }}> (com {item.partnerName})</span>
                      )}
                    </div>

                    {isRefusingThis ? (
                      <div className="cv-refuse-box">
                        <input
                          type="text"
                          className="cv-refuse-input"
                          placeholder="Motivo da recusa (ex: viagem, compromisso)"
                          value={refusalReason}
                          onChange={(e) => setRefusalReason(e.target.value)}
                          disabled={isBusy}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="cv-send-btn"
                            disabled={isBusy}
                            style={{
                              fontSize: '14px',
                              height: '36px',
                              borderRadius: '6px',
                              padding: '0 14px',
                              width: 'auto',
                              backgroundColor: 'var(--cv-danger)',
                            }}
                            onClick={() => void handleConfirmRefusal(item.partId)}
                          >
                            {isBusy ? 'Enviando...' : 'Enviar recusa'}
                          </button>
                          <button
                            type="button"
                            className="cv-choice-btn"
                            disabled={isBusy}
                            style={{ fontSize: '14px', padding: '6px 12px', borderRadius: '6px' }}
                            onClick={() => {
                              setRefusingPartId(null);
                              setRefusalReason('');
                            }}
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <button
                          type="button"
                          className="cv-send-btn"
                          disabled={isBusy}
                          style={{
                            fontSize: '14px',
                            height: '36px',
                            borderRadius: '6px',
                            padding: '0 14px',
                            width: 'auto',
                          }}
                          onClick={() => void handleConfirm(item.partId)}
                        >
                          {isBusy ? 'Confirmando...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          className="cv-choice-btn"
                          disabled={isBusy}
                          style={{ fontSize: '14px', padding: '6px 12px', borderRadius: '6px' }}
                          onClick={() => {
                            setRefusingPartId(item.partId);
                            setRefusalReason('');
                            setActionError(null);
                          }}
                        >
                          Não poderei
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                    <strong>{formatDateBr(item.dateStr)}</strong> — {item.tipoParte}
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
                    {formatDateBr(ev.startDate)}
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

