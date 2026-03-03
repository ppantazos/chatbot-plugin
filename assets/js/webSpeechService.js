/**
 * Web Speech API - browser native speech-to-text (no OpenAI/Whisper)
 * Matches production flow: no external transcription API calls.
 */
export class WebSpeechService {
    constructor() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
        this.onTranscript = null;
        this.onError = null;
        this.isListening = false;
    }

    isAvailable() {
        return !!this.recognition;
    }

    start() {
        if (!this.recognition) return;
        if (this.isListening) return;
        try {
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript?.trim();
                        if (transcript && this.onTranscript) {
                            this.onTranscript(transcript);
                        }
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    this.onError?.(new Error(event.error || 'Speech recognition error'));
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                if (this.shouldKeepListening && this.recognition) {
                    try { this.recognition.start(); this.isListening = true; } catch (e) {}
                }
            };
            this.shouldKeepListening = true;

            this.recognition.start();
            this.isListening = true;
        } catch (e) {
            this.onError?.(e);
        }
    }

    stop() {
        this.shouldKeepListening = false;
        if (!this.recognition || !this.isListening) return;
        try {
            this.recognition.abort();
        } catch (e) {}
        this.isListening = false;
    }

    cleanup() {
        this.stop();
    }
}
