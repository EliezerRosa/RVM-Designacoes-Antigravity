import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import * as pdfjsLib from 'pdfjs-dist';

// Configuração Global do Worker PDF (Antes de qualquer renderização)
// Garante que o worker local seja usado em vez do CDN instável
const baseUrl = import.meta.env.BASE_URL || '/';
try {
  const workerUrl = `${baseUrl.replace(/\/$/, '')}/pdf.worker.min.mjs`;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  console.log('[PDF.js] Worker configured:', workerUrl);
} catch (e) {
  console.error('[PDF.js] Error configuring worker:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
