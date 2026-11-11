import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { AuthProvider } from '../../context/AuthContext';
import { ConversaApp } from './ui/ConversaApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ConversaApp />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
