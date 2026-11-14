import React, { useState, useEffect, useRef } from 'react';
import { VoiceToggle } from './VoiceToggle';
import { voicePort } from '../ports/voicePort';

interface ComposerProps {
  onSendMessage: (text: string) => void;
  isProcessing?: boolean;
  voiceActive?: boolean;
  onPreferTextMode?: () => void;
  onVoiceModeChange?: (voiceEnabled: boolean) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isProcessing = false,
  voiceActive = true,
  onPreferTextMode,
  onVoiceModeChange,
}) => {
  const [text, setText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(voiceActive);
  const [prevVoiceActive, setPrevVoiceActive] = useState(voiceActive);
  const [isListening, setIsListening] = useState(false);
  const stopListeningRef = useRef<(() => void) | null>(null);

  if (voiceActive !== prevVoiceActive) {
    setPrevVoiceActive(voiceActive);
    setIsVoiceMode(voiceActive);
    if (!voiceActive && isListening) {
      setIsListening(false);
    }
  }

  useEffect(() => {
    if (!voiceActive && stopListeningRef.current) {
      stopListeningRef.current();
      stopListeningRef.current = null;
    }
  }, [voiceActive]);

  // Alterna entre modo voz (prioritário) e modo texto
  const handleToggleMode = () => {
    if (isListening) {
      if (stopListeningRef.current) {
        stopListeningRef.current();
        stopListeningRef.current = null;
      }
      setIsListening(false);
      setIsVoiceMode(false);
      onVoiceModeChange?.(false);
      return;
    }

    const nextMode = !isVoiceMode;
    setIsVoiceMode(nextMode);
    onVoiceModeChange?.(nextMode);

    if (nextMode) {
      startVoiceListening();
    }
  };

  // Ao tocar na caixa de texto, prioriza modo texto imediatamente
  const handleTextInputTouch = () => {
    if (stopListeningRef.current) {
      stopListeningRef.current();
      stopListeningRef.current = null;
    }
    if (isListening) {
      setIsListening(false);
    }
    if (isVoiceMode) {
      setIsVoiceMode(false);
    }
    onPreferTextMode?.();
  };

  const startVoiceListening = () => {
    setIsListening(true);
    const stopFn = voicePort.startListening(
      (transcript, isFinal) => {
        setText(transcript);
        if (isFinal && transcript.trim()) {
          setIsListening(false);
          onSendMessage(transcript.trim());
          setText('');
        }
      },
      (error) => {
        console.warn('[Composer] Erro de voz:', error);
        setIsListening(false);
      }
    );
    stopListeningRef.current = stopFn;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isProcessing) return;

    if (isListening && stopListeningRef.current) {
      stopListeningRef.current();
      stopListeningRef.current = null;
      setIsListening(false);
    }

    onSendMessage(text.trim());
    setText('');
  };

  useEffect(() => {
    return () => {
      if (stopListeningRef.current) stopListeningRef.current();
    };
  }, []);

  return (
    <form className="cv-composer" onSubmit={handleSubmit}>
      <VoiceToggle
        isVoiceMode={isVoiceMode}
        isListening={isListening}
        onToggleMode={handleToggleMode}
      />

      <div className="cv-input-wrapper">
        <input
          type="text"
          className="cv-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={handleTextInputTouch}
          onFocus={handleTextInputTouch}
          placeholder={
            isListening
              ? 'Ouvindo... Escreva ou fale sua pergunta'
              : isVoiceMode
              ? 'Escreva ou fale sua pergunta (voz ativa)...'
              : 'Escreva ou fale sua pergunta...'
          }
          disabled={isProcessing}
        />
      </div>

      <button
        type="submit"
        className="cv-send-btn"
        disabled={!text.trim() || isProcessing}
        title="Enviar mensagem"
        aria-label="Enviar"
      >
        ➤
      </button>
    </form>
  );
};

