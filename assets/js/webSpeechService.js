/**
 * Web Speech API - browser native speech-to-text (no OpenAI/Whisper)
 * Matches production flow: no external transcription API calls.
 * iOS Safari: use non-continuous mode and accept interim result on end (isFinal often never true).
 */
export class WebSpeechService {
    constructor() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
        this.onTranscript = null;
        this.onError = null;
        this.onSpeechEnd = null;
        this.onLogResult = null;
        this.onLogStart = null;
        this.onLogEnd = null;
        this.onLogError = null;
        this.isListening = false;
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this._lastInterim = '';
    }

    isAvailable() {
        return !!this.recognition;
    }

    start() {
        if (!this.recognition) return;
        if (this.isListening) return;
        try {
            this._lastInterim = '';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = (navigator.language && navigator.language.length >= 2) ? navigator.language : 'en-US';
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0]?.transcript?.trim();
                    if (!transcript) continue;
                    this.onLogResult?.(transcript, result.isFinal);
                    if (result.isFinal && this.onTranscript) {
                        // On mobile only send from onend (_lastInterim) to avoid duplicates: we get partial + final + same again in onend
                        if (!this.isMobile) {
                            this.onTranscript(transcript);
                            this._lastInterim = '';
                        }
                    }
                    this._lastInterim = transcript;
                }
            };

            this.recognition.onerror = (event) => {
                this.onLogError?.(event.error, event.message);
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    const msg = event.error === 'not-allowed' ? 'Microphone or speech permission denied' : (event.error || 'Speech recognition error');
                    this.onError?.(new Error(msg));
                }
                this.onSpeechEnd?.();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.onLogEnd?.(this._lastInterim || null);
                if (this.isMobile && this._lastInterim && this._lastInterim.length >= 2 && this.onTranscript) {
                    this.onTranscript(this._lastInterim);
                }
                this._lastInterim = '';
                if (this.shouldKeepListening && this.recognition) {
                    try { this.recognition.start(); this.isListening = true; } catch (e) {}
                }
                this.onSpeechEnd?.();
            };
            this.shouldKeepListening = true;

            // Log start before recognition.start() so we always show it; on iOS start() can throw after recognition actually begins, so end still fires
            this.isListening = true;
            this.onLogStart?.();
            this.recognition.start();
        } catch (e) {
            this.isListening = false;
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
