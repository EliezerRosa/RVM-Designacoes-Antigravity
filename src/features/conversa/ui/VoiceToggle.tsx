import React from 'react';

interface VoiceToggleProps {
  isVoiceMode: boolean;
  isListening: boolean;
  onToggleMode: () => void;
}

export const VoiceToggle: React.FC<VoiceToggleProps> = ({
  isVoiceMode,
  isListening,
  onToggleMode,
}) => {
  return (
    <button
      type="button"
      className={`cv-toggle-btn ${isListening ? 'cv-listening' : ''}`}
      onClick={onToggleMode}
      title={isVoiceMode ? 'Alternar para Teclado' : 'Alternar para Microfone'}
      aria-label={isVoiceMode ? 'Alternar para Teclado' : 'Alternar para Microfone'}
    >
      {isListening ? '🔴' : isVoiceMode ? '🎙' : '⌨︎'}
    </button>
  );
};

