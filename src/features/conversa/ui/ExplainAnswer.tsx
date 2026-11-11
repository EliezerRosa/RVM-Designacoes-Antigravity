import React from 'react';
import type { ExplanationResult } from '../ports/knowledgePort';

interface ExplainAnswerProps {
  data: ExplanationResult;
}

export const ExplainAnswer: React.FC<ExplainAnswerProps> = ({ data }) => {
  return (
    <div className="cv-card">
      <div className="cv-card-title">📖 {data.title}</div>
      <p style={{ margin: '6px 0 12px 0', fontSize: '16px' }}>{data.summary}</p>
      {data.details && data.details.length > 0 && (
        <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '15px' }}>
          {data.details.map((detail, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>
              {detail}
            </li>
          ))}
        </ul>
      )}
      {data.officialSource && (
        <div className="cv-source-pill">
          <span>Fonte Oficial:</span>
          <strong>{data.officialSource}</strong>
        </div>
      )}
    </div>
  );
};
