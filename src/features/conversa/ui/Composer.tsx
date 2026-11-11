import React, { useState, useEffect, useRef } from 'react';
import { VoiceToggle } from './VoiceToggle';
import { voicePort } from '../ports/voicePort';

interface ComposerProps {
  onSendMessage: (text: string) => void;
  isProcessing?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isProcessing = false,
}) => {
  const [text, setText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopListeningRef = useRef<(() => void) | null>(null);

  // Alterna entre modo texto e modo voz
  const handleToggleMode = () => {
    if (isListening) {
      if (stopListeningRef.current) stopListeningRef.current();
      setIsListening(false);
      return;
    }

    const nextMode = !isVoiceMode;
    setIsVoiceMode(nextMode);

    if (nextMode) {
      startVoiceListening();
    }
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
          placeholder={
            isListening
              ? 'Ouvindo... Fale agora'
              : isVoiceMode
              ? 'Fale ou digite sua solicitação...'
              : 'Escreva ou fale sua pergunta...'
          }
          disabled={isProcessing}
          autoFocus
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

