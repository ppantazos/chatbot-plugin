/**
 * Avatar - LiveAvatar integration via ilianaaiAvatar proxy
 * Uses LiveAvatar FULL mode: token -> start -> LiveKit connection -> publishData for speak
 */
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

    // Callbacks for avatar speech events
    onAvatarSpeechStart = null;
    onAvatarSpeechEnd = null;

    constructor(apiConfig, onDataReceived, onTrackSubscribed, onTrackUnsubscribed, onDisconnect) {
        this.config = apiConfig;
        this.onDataReceived = onDataReceived;
        this.onTrackSubscribed = onTrackSubscribed;
        this.onTrackUnsubscribed = onTrackUnsubscribed;
        this.onDisconnect = onDisconnect;

        this.audioStream = null;
        this.existingStream = null;
        this.audioTrackPublication = null;
        this.isMuted = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
    }

    get baseUrl() {
        return this.config.serverUrl?.replace(/\/$/, '') || '';
    }

    async getSessionToken() {
        const payload = {
            avatar_id: this.config.avatarId,
            context_id: this.config.knowledgeBaseId ?? this.config.contextId ?? null,
            voice_id: this.config.voiceId ?? null,
            language: 'en',
        };

        const response = await fetch(`${this.baseUrl}/api/sessions/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || 'Failed to create session token');
        }
        this.sessionToken = data.session_token;
        this.sessionInfo = {
            session_id: data.session_id,
            session_token: data.session_token,
        };
    }

    /**
     * Map LiveAvatar agent-response events to format expected by main.js.
     * See https://docs.liveavatar.com/docs/full-mode-events
     * Server events use event_type (not type) and come on topic agent-response.
     */
    mapLiveAvatarEvent(eventData) {
        const eventType = eventData.event_type ?? eventData.type;
        if (eventType === 'avatar.speak_started' || eventType === 'agent.speak_started') {
            return { type: 'avatar_start_talking' };
        }
        if (eventType === 'avatar.speak_ended' || eventType === 'agent.speak_ended') {
            return { type: 'avatar_stop_talking' };
        }
        // LiveAvatar sends avatar.transcription per word/phrase while speaking.
        // Treat as streaming chunk; main.js finalizes on avatar_stop_talking.
        if (eventType === 'avatar.transcription' && eventData.text != null) {
            return { type: 'avatar_talking_message', message: String(eventData.text) };
        }
        if (eventType === 'user.transcription' && eventData.text != null) {
            return { type: 'user_transcription', message: String(eventData.text) };
        }
        if (eventData.type === 'avatar_talking_message' || eventData.type === 'avatar_end_message') {
            return eventData;
        }
        if (eventData.text !== undefined) {
            return { type: 'avatar_end_message', message: eventData.text || eventData.message || '' };
        }
        return eventData;
    }

    handleDataReceived(message, topic) {
        const payload = message?.data ?? message;
        const rawData = new TextDecoder().decode(payload);
        let eventData;
        try {
            eventData = JSON.parse(rawData);
        } catch {
            return;
        }
        // LiveAvatar server events come on topic agent-response (see full-mode-events docs)
        if (topic != null && topic !== 'agent-response') {
            return;
        }
        const mapped = this.mapLiveAvatarEvent(eventData);
        if (!mapped || !mapped.type) return;
        if (mapped.type === 'avatar_start_talking') {
            this.onAvatarSpeechStart?.();
        } else if (mapped.type === 'avatar_stop_talking') {
            this.onAvatarSpeechEnd?.();
        }
        this.onDataReceived?.(new TextEncoder().encode(JSON.stringify(mapped)));
    }

    async createSession() {
        if (!this.sessionToken) {
            await this.getSessionToken();
        }
        await new Promise(r => setTimeout(r, 300));

        const response = await fetch(`${this.baseUrl}/api/sessions/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sessionToken}`,
            },
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || 'Failed to start session');
        }

        this.sessionInfo = {
            session_id: data.session_id,
            url: data.livekit_url,
            access_token: data.livekit_client_token,
            livekit_url: data.livekit_url,
            livekit_client_token: data.livekit_client_token,
            ws_url: data.ws_url,
        };

        this.createRoom();
        this.handleRoomEvents();

        await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);
    }

    async startStreaming() {
        if (!this.sessionInfo) {
            await this.createSession();
        }

        await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token);

        await new Promise(resolve => setTimeout(resolve, 500));

        this.sendStartListening();

        document.dispatchEvent(new Event('streamSessionStarted'));
    }

    sendStartListening() {
        if (!this.sessionInfo || !this.room) return;
        const sessionId = this.sessionInfo.session_id;
        if (!sessionId) return;
        try {
            const payload = { event_type: 'avatar.start_listening', session_id: sessionId };
            this.room.localParticipant?.publishData(
                new TextEncoder().encode(JSON.stringify(payload)),
                { reliable: true, topic: 'agent-control' }
            );
        } catch (error) {
            // Silent error handling
        }
    }

    async sendText(text, taskType = 'repeat') {
        if (!this.sessionInfo || !this.room) return;
        const sessionId = this.sessionInfo.session_id;
        if (!sessionId) return;

        try {
            // FULL mode: publish to topic agent-control with event_type and session_id
            // https://docs.liveavatar.com/docs/full-mode-events
            const eventType = taskType === 'talk' ? 'avatar.speak_response' : 'avatar.speak_text';
            const payload = { event_type: eventType, session_id: sessionId, text: String(text) };
            this.room.localParticipant?.publishData(
                new TextEncoder().encode(JSON.stringify(payload)),
                { reliable: true, topic: 'agent-control' }
            );
        } catch (error) {
            // Silent error handling
        }
    }

    async keepAlive() {
        if (!this.sessionToken || !this.sessionInfo) {
            return;
        }
        try {
            await fetch(`${this.baseUrl}/api/sessions/keep-alive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.sessionToken}`,
                },
                body: JSON.stringify({ session_id: this.sessionInfo.session_id }),
            });
        } catch (error) {
            // Silent error handling
        }
    }

    async closeSession() {
        if (!this.sessionInfo) {
            return;
        }

        try {
            if (this.sessionToken) {
                await fetch(`${this.baseUrl}/api/sessions/stop`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.sessionToken}`,
                    },
                    body: JSON.stringify({ session_id: this.sessionInfo.session_id }),
                });
            }
        } catch (error) {
            // Silent error handling
        }

        if (this.webSocket) {
            this.webSocket.close();
        }

        if (this.room) {
            this.room.disconnect();
        }

        document.dispatchEvent(new Event('streamSessionClosed'));

        this.sessionInfo = null;
        this.room = null;
        this.sessionToken = null;
    }

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
            this.handleDataReceived(message, topic);
        });
        this.room.on(LivekitClient.RoomEvent.TrackSubscribed, this.onTrackSubscribed);
        this.room.on(LivekitClient.RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed);
        this.room.on(LivekitClient.RoomEvent.Disconnected, this.onDisconnect);
    }

    setExistingStream(stream) {
        this.existingStream = stream;
    }

    async startVoiceInput(existingStream = null) {
        return;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.audioTrackPublication) {
            this.audioTrackPublication.setMuted(this.isMuted);
        } else if (this.room?.localParticipant) {
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
        return 0;
    }

    cleanupVoiceInput() {
        this.audioStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.audioTrackPublication = null;
    }
}
