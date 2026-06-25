import type { VoiceTranscript } from "@toki/shared";

type BrowserSpeechRecognitionResult = {
  readonly 0: { transcript: string; confidence: number };
  readonly isFinal: boolean;
};

type BrowserSpeechRecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  readonly error?: string;
  readonly message?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

export type VoiceRecognitionSession = {
  stop: () => void;
  abort: () => void;
};

export type VoiceRecognitionCallbacks = {
  onStart: () => void;
  onTranscript: (transcript: VoiceTranscript) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function startVoiceRecognition(
  callbacks: VoiceRecognitionCallbacks,
): VoiceRecognitionSession {
  const SpeechRecognition = getSpeechRecognitionConstructor();

  if (SpeechRecognition == null) {
    throw new Error("Speech recognition is not available in this WebView.");
  }

  const recognition = new SpeechRecognition();
  let stoppedByApp = false;

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    callbacks.onStart();
  };

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result[0];
      const text = alternative.transcript.trim();

      if (text.length === 0) {
        continue;
      }

      callbacks.onTranscript({
        text,
        confidence: alternative.confidence,
        isFinal: result.isFinal,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  recognition.onerror = (event) => {
    const detail = event.message ?? event.error ?? "Unknown voice recognition error.";
    callbacks.onError(detail);
  };

  recognition.onend = () => {
    if (!stoppedByApp) {
      callbacks.onEnd();
    }
  };

  recognition.start();

  return {
    stop: () => {
      stoppedByApp = true;
      recognition.stop();
    },
    abort: () => {
      stoppedByApp = true;
      recognition.abort();
    },
  };
}
