/**
 * VoicePort — Adaptador de Voz Multimodal (Web Speech API)
 *
 * Suporte completo a ditado (STT) e leitura em voz alta (TTS) em pt-BR.
 * Degradação suave: se o navegador não suportar, opera normalmente em modo texto.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

let activeRecognition: SpeechRecognitionInstance | null = null;

export const voicePort = {
  /**
   * Verifica suporte a reconhecimento de voz no navegador
   */
  isRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  /**
   * Verifica suporte a síntese de voz (áudio falado)
   */
  isSynthesisSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.speechSynthesis;
  },

  /**
   * Inicia escuta contínua de voz com transcrição em tempo real
   */
  startListening(
    onTranscript: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ): () => void {
    if (!this.isRecognitionSupported()) {
      onError('Reconhecimento de voz não suportado neste navegador.');
      return () => {};
    }

    try {
      if (activeRecognition) {
        try {
          activeRecognition.stop();
        } catch {
          // Ignora parada de instância anterior já encerrada
        }
      }

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        onError('Reconhecimento de voz não suportado neste navegador.');
        return () => {};
      }
      const rec = new SpeechRec();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        if (final) {
          onTranscript(final.trim(), true);
        } else if (interim) {
          onTranscript(interim.trim(), false);
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        console.warn('[VoicePort] Erro de reconhecimento:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          onError(`Erro de microfone: ${event.error}`);
        }
      };

      rec.onend = () => {
        activeRecognition = null;
      };

      rec.start();
      activeRecognition = rec;

      return () => {
        try {
          rec.stop();
        } catch {
          // Ignora encerramento repetido
        }
        activeRecognition = null;
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onError(`Falha ao iniciar escuta: ${msg}`);
      return () => {};
    }
  },

  /**
   * Interrompe escuta ativa
   */
  stopListening(): void {
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch {
        // Ignora encerramento repetido
      }
      activeRecognition = null;
    }
  },

  /**
   * Fala em voz alta um texto resumido em pt-BR
   */
  speak(text: string, onEnd?: () => void): void {
    if (!this.isSynthesisSupported()) {
      if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Cancela falas anteriores

      const cleanText = text.replace(/[*_#`[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05; // Leve aceleração natural
      utterance.pitch = 1.0;

      // Selecionar voz em pt-BR se disponível
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang.startsWith('pt') || v.lang.includes('BR'));
      if (ptVoice) utterance.voice = ptVoice;

      if (onEnd) {
        utterance.onend = () => onEnd();
        utterance.onerror = () => onEnd();
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[VoicePort] Erro na síntese de voz:', e);
      if (onEnd) onEnd();
    }
  },

  /**
   * Silencia qualquer áudio que esteja sendo reproduzido
   */
  stopSpeaking(): void {
    if (this.isSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignora erro de síntese inativa
      }
    }
  },
};

