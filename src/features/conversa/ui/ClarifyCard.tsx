import React from 'react';
import type { DisambiguationCandidate } from '../core/entityResolver';

interface ClarifyCardProps {
  title: string;
  candidates: DisambiguationCandidate[];
  onSelectCandidate: (candidate: DisambiguationCandidate, index: number) => void;
  onCancel?: () => void;
}

export const ClarifyCard: React.FC<ClarifyCardProps> = ({
  title,
  candidates,
  onSelectCandidate,
  onCancel,
}) => {
  return (
    <div className="cv-card">
      <div className="cv-card-title">{title}</div>
      <div className="cv-clarify-grid">
        {candidates.map((cand, idx) => (
          <button
            key={cand.id}
            type="button"
            className="cv-choice-btn"
            onClick={() => onSelectCandidate(cand, idx)}
          >
            <span>
              <strong>{idx + 1}.</strong> {cand.label}
            </span>
            {cand.detail && (
              <span style={{ fontSize: '13px', opacity: 0.75 }}>{cand.detail}</span>
            )}
          </button>
        ))}
        {onCancel && (
          <button
            type="button"
            className="cv-choice-btn"
            style={{ opacity: 0.8 }}
            onClick={onCancel}
          >
            <span>Nenhum destes</span>
          </button>
        )}
      </div>
    </div>
  );
};

