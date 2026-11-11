import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import './ui/conversa.css';
import { resolveAppUrl } from '../../utils/appUrl';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { AuthProvider } from '../../context/AuthContext';
import { ConversaAuthGate } from './ui/ConversaAuthGate';
import { ConversaApp } from './ui/ConversaApp';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = resolveAppUrl('pdf.worker.min.mjs');
} catch (e) {
  console.warn('[Conversa][PDF.js] Falha ao configurar worker:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ConversaAuthGate>
          <ConversaApp />
        </ConversaAuthGate>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

