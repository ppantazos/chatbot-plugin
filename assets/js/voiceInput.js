/**
 * Single point of truth for voice input handling
 * Manages microphone access, audio recording, and provides unified interface
 */
export class VoiceInput {
    constructor() {
        this.audioStream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.silenceCheckInterval = null;
        this.speechTimeout = null;
        this.speechStartTime = null;
        
        // Callbacks
        this.onAudioLevel = null;
        this.onRecordingComplete = null;
        this.onError = null;
        
        // Mobile detection
        this.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Initialize microphone access
     * @param {MediaStream} existingStream - Optional existing stream (for mobile devices)
     * @returns {Promise<MediaStream>}
     */
    async initialize(existingStream = null) {
        try {
            // Use existing stream if provided and active
            if (existingStream && existingStream.active) {
                this.audioStream = existingStream;
            } else {
                // getUserMedia only works in secure contexts (HTTPS or localhost). Without it the prompt never shows.
                if (typeof window !== 'undefined' && !window.isSecureContext) {
                    throw new Error('Microphone requires HTTPS. Please open this site via https://');
                }
                if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                    throw new Error('Microphone not supported in this browser');
                }
                // On mobile use echo cancellation so the visualizer and system get real voice, not speaker feedback.
                const constraints = this.isMobileDevice
                    ? {
                        audio: {
                            echoCancellation: { ideal: true },
                            noiseSuppression: { ideal: true },
                            autoGainControl: { ideal: true }
                        }
                    }
                    : {
                        // Omit exact sampleRate — Firefox may reject OverconstrainedError while Chrome ignores.
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        }
                    };
                try {
                    this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (e) {
                    if (this.isMobileDevice) {
                        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    } else {
                        throw e;
                    }
                }
            }

            // Ensure all tracks are enabled
            this.audioStream.getAudioTracks().forEach(track => {
                if (!track.enabled) {
                    track.enabled = true;
                }
            });

            // Setup audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(this.audioStream);
            this.analyser.fftSize = 256;
            this.microphone.connect(this.analyser);

            return this.audioStream;
        } catch (error) {
            this.onError?.(error);
            throw error;
        }
    }

    /**
     * Start recording audio with silence detection
     * @param {number} silenceThreshold - Audio level threshold for silence detection (0-1)
     * @param {number} silenceDuration - Duration in ms to wait before stopping on silence
     * @returns {Promise<void>}
     */
    async startRecording(silenceThreshold = 0.005, silenceDuration = 1000) {
        if (!this.audioStream) {
            throw new Error('Microphone not initialized. Call initialize() first.');
        }

        if (this.isRecording) {
            return; // Already recording
        }
        
        // Clear any old chunks before starting new recording
        this.audioChunks = [];

        try {
            this.audioChunks = [];
            // Prefer WebM/Opus (Chrome); Firefox typically records Ogg/Opus.
            const mimeCandidates = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/mp4',
            ];
            let mimeType = '';
            for (const c of mimeCandidates) {
                if (MediaRecorder.isTypeSupported(c)) {
                    mimeType = c;
                    break;
                }
            }
            
            const options = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(this.audioStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            // Set up onstop handler - this will be called when recording stops
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
                this.isRecording = false;
                
                // Always call the callback if it exists (even if blob is empty - let the callback decide)
                if (this.onRecordingComplete) {
                    this.onRecordingComplete(audioBlob);
                }
            };
            
            this.mediaRecorder.onerror = (event) => {
                this.onError?.(event.error);
            };

            // Start recording with timeslice to get data periodically
            try {
                this.mediaRecorder.start(100); // Get data every 100ms for better responsiveness
                this.isRecording = true;
                
                // Verify recording actually started
                setTimeout(() => {
                    if (this.mediaRecorder.state !== 'recording') {
                        this.onError?.(new Error('MediaRecorder failed to start'));
                    }
                }, 100);
            } catch (error) {
                this.isRecording = false;
                this.onError?.(error);
                throw error;
            }
            
            // Speech detection using interval (similar to reference implementation)
            if (this.analyser) {
                let silenceStartTime = null;
                let isProcessingSpeechEnd = false; // Flag to prevent multiple calls
                const silenceCheckInterval = setInterval(() => {
                    if (!this.isRecording) {
                        clearInterval(silenceCheckInterval);
                        return;
                    }
                    
                    const audioLevel = this.getAudioLevel();
                    const isSpeechDetected = audioLevel > silenceThreshold;
                    
                    if (isSpeechDetected) {
                        // Speech detected - reset silence timer
                        silenceStartTime = null;
                        isProcessingSpeechEnd = false;
                        // Clear any existing timeout
                        if (this.speechTimeout) {
                            clearTimeout(this.speechTimeout);
                            this.speechTimeout = null;
                        }
                    } else if (!isSpeechDetected && this.isRecording && !isProcessingSpeechEnd) {
                        // Silence detected - start timeout
                        if (silenceStartTime === null) {
                            silenceStartTime = Date.now();
                        }
                        
                        // If silence duration exceeded, stop recording
                        if (Date.now() - silenceStartTime > silenceDuration) {
                            isProcessingSpeechEnd = true;
                            clearInterval(silenceCheckInterval);
                            this.silenceCheckInterval = null;
                            this.stopRecording();
                        }
                    }
                }, 100); // Check every 100ms
                
                // Store interval ID for cleanup
                this.silenceCheckInterval = silenceCheckInterval;
            }
        } catch (error) {
            this.onError?.(error);
            throw error;
        }
    }

    /**
     * Stop recording audio
     * @returns {Promise<Blob>}
     */
    // This method is no longer used - we stop recording directly in silence detection
    // Keeping for backwards compatibility but it's not called anymore
    handleSpeechEnd() {
        // This is now handled directly in the silence detection interval
    }

    /**
     * Stop recording without firing onRecordingComplete (avatar spoke, session reset, etc.)
     */
    abortRecording() {
        if (this.silenceCheckInterval) {
            clearInterval(this.silenceCheckInterval);
            this.silenceCheckInterval = null;
        }
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }
        const mr = this.mediaRecorder;
        if (mr && mr.state === 'recording') {
            mr.ondataavailable = null;
            mr.onstop = () => {};
            try {
                mr.stop();
            } catch (e) {
                // ignore
            }
        }
        this.mediaRecorder = null;
        this.isRecording = false;
        this.audioChunks = [];
    }

    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return null;
        }

        // Clear silence detection interval
        if (this.silenceCheckInterval) {
            clearInterval(this.silenceCheckInterval);
            this.silenceCheckInterval = null;
        }
        
        // Clear speech timeout
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }

        // Don't overwrite the onstop handler - it's already set up in startRecording
        // Just stop the recorder and let the existing handler fire
        if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            
            // Fallback: Ensure callback is called even if onstop doesn't fire
            // Wait a bit for onstop to fire, then manually trigger if needed
            setTimeout(() => {
                if (this.isRecording && this.audioChunks.length > 0) {
                    const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
                    this.isRecording = false;
                    if (this.onRecordingComplete) {
                        this.onRecordingComplete(audioBlob);
                    }
                }
            }, 500);
            
            // The onstop handler set in startRecording() will fire and call onRecordingComplete
            return null; // Return null since callback handles the result
        } else {
            return null;
        }
    }

    /**
     * Get current audio level for visualization (0-1)
     * @returns {number}
     */
    getAudioLevel() {
        if (!this.analyser) return 0;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        
        return (sum / dataArray.length) / 255; // Normalize to 0-1
    }

    /**
     * Check if microphone is active
     * @returns {boolean}
     */
    isActive() {
        return this.audioStream !== null && 
               this.audioStream.active && 
               this.audioStream.getAudioTracks().some(track => track.readyState === 'live');
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Stop recording without notifying consumers (session teardown)
        if (this.isRecording && this.mediaRecorder) {
            this.abortRecording();
        }
        
        // Clear silence detection interval
        if (this.silenceCheckInterval) {
            clearInterval(this.silenceCheckInterval);
            this.silenceCheckInterval = null;
        }
        
        // Clear speech timeout
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }

        // Stop audio tracks
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
        }

        // Reset state
        this.audioStream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
    }

    /**
     * Resume audio context (needed for mobile browsers)
     */
    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (error) {
                // Silent error handling
            }
        }
    }
}
