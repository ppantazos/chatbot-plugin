export class Avatar
{
    config = {};
    onDataReceived;
    onTrackSubscribed;
    onTrackUnsubscribed;
    onDisconnect;

    sessionToken = null;
    sessionInfo = null;
    room = null;
    webSocket = null;
    
    // Callbacks for WebSocket events
    onAvatarSpeechStart = null;
    onAvatarSpeechEnd = null;

    constructor(apiConfig, onDataReceived, onTrackSubscribed, onTrackUnsubscribed, onDisconnect) {
        this.config = apiConfig;

        this.onDataReceived = onDataReceived;
        this.onTrackSubscribed = onTrackSubscribed;
        this.onTrackUnsubscribed = onTrackUnsubscribed;
        this.onDisconnect = onDisconnect;

        // Voice input properties (kept for compatibility but not used for audio publishing)
        this.audioStream = null;
        this.existingStream = null;
        this.audioTrackPublication = null;
        this.isMuted = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
    }

    async getSessionToken() {
        const response = await fetch(
            `${this.config.serverUrl}/v1/streaming.create_token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": this.config.apiKey,
                },
            }
        );

        const data = await response.json();
        this.sessionToken = data.data.token;
    }

    async connectWebSocket(sessionId) {
        const params = new URLSearchParams({
            session_id: sessionId,
            session_token: this.sessionToken,
            silence_response: false,
            opening_text: "",
            stt_language: "en",
            enable_tts: true,
            enable_stt: false, // Disabled - we use OpenAI Whisper for STT
        });

        const wsUrl = `wss://${new URL(this.config.serverUrl).hostname}/v1/ws/streaming.chat?${params}`;

        this.webSocket = new WebSocket(wsUrl);

        // Handle WebSocket events
        this.webSocket.addEventListener("message", (event) => {
            try {
                const eventData = JSON.parse(event.data);
                this.handleWebSocketMessage(eventData);
            } catch (error) {
                // Silent error handling
            }
        });

        this.webSocket.addEventListener("open", async () => {
            // Voice input is initialized in Start button handler (user gesture)
            // This ensures mic permission and audio pipeline setup happen in the same gesture
        });

        this.webSocket.addEventListener("error", (error) => {
            // Silent error handling
        });

        this.webSocket.addEventListener("close", (event) => {
            // Silent error handling
        });
    }

    handleWebSocketMessage(eventData) {
        if (eventData.type === 'user_speech_start') {
            this.onVoiceInputStart?.();
        } else if (eventData.type === 'user_speech_end') {
            this.onVoiceInputEnd?.();
        } else if (eventData.type === 'avatar_speech_start') {
            this.onAvatarSpeechStart?.();
        } else if (eventData.type === 'avatar_speech_end') {
            this.onAvatarSpeechEnd?.();
        } else if (eventData.type === 'user_talking_message') {
            // Avatar STT transcribed the audio (not used since we use OpenAI Whisper)
        } else if (eventData.type === 'avatar_talking_message') {
            // Avatar is speaking - show streaming text
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_talking_message',
                message: eventData.message || eventData.text || ''
            })));
        } else if (eventData.type === 'avatar_end_message') {
            // Avatar finished speaking - finalize text
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_end_message',
                message: eventData.message || eventData.text || ''
            })));
        }
    }

    async createSession() {
        if (! this.sessionToken) {
            await this.getSessionToken();
        }

        // Create new session
        const response = await fetch(`${this.config.serverUrl}/v1/streaming.new`, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-type": "application/json",
                "X-Api-Key": this.config.apiKey
            },
            body: JSON.stringify({
                quality: "medium",
                version: "v2",
                avatar_id: this.config.avatarId,
                knowledge_base_id: this.config.knowledgeBaseId
            })
        });

        const sessionData = await response.json();
        this.sessionInfo = sessionData.data;

        this.createRoom();
        this.handleRoomEvents();

        await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);

        // Connect WebSocket after room preparation
        await this.connectWebSocket(this.sessionInfo.session_id);
    }

    async startStreaming() {
        if (! this.sessionInfo) {
            await this.createSession();
        }

        // Start streaming
        await fetch(`${this.config.serverUrl}/v1/streaming.start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-api-key": this.config.apiKey
            },
            body: JSON.stringify({
                session_id: this.sessionInfo.session_id
            })
        });

        // Connect to LiveKit room
        await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token);
        
        // Wait for room to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Note: Audio publishing removed - we use OpenAI Whisper for STT instead
        // Avatar only receives text and responds with TTS

        document.dispatchEvent(new Event('streamSessionStarted'));
    }

    // Send text to avatar
    async sendText(text, taskType = "repeat") {
        if (!this.sessionInfo) {
            return;
        }

        try {
            const response = await fetch(
                `${this.config.serverUrl}/v1/streaming.task`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Api-Key": this.config.apiKey,
                    },
                    body: JSON.stringify({
                        session_id: this.sessionInfo.session_id,
                        text: text,
                        task_type: taskType,
                    }),
                }
            );
        } catch (error) {
            // Silent error handling
        }
    }

    async closeSession() {
        if (!this.sessionInfo) {
            return;
        }

        await fetch(
            `${this.config.serverUrl}/v1/streaming.stop`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": this.config.apiKey,
                },
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                }),
            }
        );

        // Close WebSocket
        if (this.webSocket) {
            this.webSocket.close();
        }

        // Disconnect from LiveKit room
        if (this.room) {
            this.room.disconnect();
        }

        document.dispatchEvent(new Event('streamSessionClosed'));

        this.sessionInfo = null;
        this.room = null;
        this.sessionToken = null;
    }

    // Create LiveKit Room
    createRoom() {
        this.room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
                resolution: LivekitClient.VideoPresets.h720.resolution,
            },
        });
    }

    handleRoomEvents() {
        this.room.on(LivekitClient.RoomEvent.DataReceived, (message, participant, kind, topic) => {
            this.onDataReceived(message);
        });
        this.room.on(LivekitClient.RoomEvent.TrackSubscribed, this.onTrackSubscribed);
        this.room.on(LivekitClient.RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed);
        this.room.on(LivekitClient.RoomEvent.Disconnected, this.onDisconnect);
    }

    // Set existing stream (deprecated - kept for compatibility)
    setExistingStream(stream) {
        this.existingStream = stream;
    }

    // Voice Input Methods (deprecated - voice input now handled by VoiceInput class)
    async startVoiceInput(existingStream = null) {
        // No-op: Voice input is now handled by VoiceInput class in main.js
        // This method is kept for compatibility but does nothing
        return;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.audioTrackPublication) {
            this.audioTrackPublication.setMuted(this.isMuted);
        } else if (this.room?.localParticipant) {
            // Fallback: find the microphone publication
            for (const pub of this.room.localParticipant.trackPublications.values()) {
                if (pub.source === LivekitClient.Track.Source.Microphone) {
                    pub.setMuted(this.isMuted);
                    break;
                }
            }
        }
        
        return this.isMuted;
    }

    getAudioLevel() {
        // Deprecated: Audio level is now provided by VoiceInput class
        // This method is kept for compatibility but returns 0
        return 0;
    }

    cleanupVoiceInput() {
        // No-op: Voice input cleanup is now handled by VoiceInput class in main.js
        // This method is kept for compatibility but does nothing
        this.audioStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.audioTrackPublication = null;
    }
}

