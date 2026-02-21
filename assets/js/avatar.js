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

    /** Agent-response topic for LiveAvatar server events */
    static AGENT_RESPONSE_TOPIC = 'agent-response';
    /** Agent-control topic for command events */
    static AGENT_CONTROL_TOPIC = 'agent-control';

    // Callbacks for avatar speech events
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

    /**
     * Create session token (LiveAvatar).
     * Returns session_id, session_token.
     */
    async getSessionToken() {
        const response = await fetch(
            `${this.config.serverUrl}/v1/sessions/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": this.config.apiKey,
                },
                body: JSON.stringify({
                    conversation_id: this.config.conversationId || null
                }),
            }
        );

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.detail || data?.message || 'Failed to create session token');
        }
        this.sessionToken = data.data?.session_token;
        return data.data?.session_id;
    }

    /**
     * Start session (LiveAvatar).
     * Returns livekit_url, livekit_client_token for room connection.
     */
    async startSession() {
        const response = await fetch(`${this.config.serverUrl}/v1/sessions/start`, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.sessionToken}`,
            },
        });

        const sessionData = await response.json();
        if (!response.ok) {
            throw new Error(sessionData?.detail || sessionData?.message || 'Failed to start session');
        }
        const data = sessionData.data;
        // Normalize to url/access_token for room.prepareConnection/connect compatibility
        this.sessionInfo = {
            session_id: data.session_id,
            url: data.livekit_url,
            access_token: data.livekit_client_token,
            intro: data.intro,
        };
        return this.sessionInfo;
    }

    /**
     * Handle LiveAvatar server events from agent-response topic.
     * Maps to internal event format for main.js compatibility.
     */
    handleAgentResponseEvent(eventData) {
        const eventType = eventData.event_type;
        const text = eventData.text ?? '';

        if (eventType === 'avatar.speak_started') {
            this.onAvatarSpeechStart?.();
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_start_talking',
            })));
        } else if (eventType === 'avatar.speak_ended') {
            this.onAvatarSpeechEnd?.();
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_stop_talking',
            })));
        } else if (eventType === 'avatar.transcription' && text) {
            // LiveAvatar sends full text at once (not streamed). Emit for display; avatar report only on speak_ended.
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_talking_message',
                message: text,
                text: text,
            })));
            this.onDataReceived?.(new TextEncoder().encode(JSON.stringify({
                type: 'avatar_end_message',
                message: text,
                text: text,
            })));
        } else if (eventType === 'user.transcription' && text?.trim()) {
            this.reportUserMessage(text.trim());
        }
    }

    /**
     * Report user transcription to ilianaaiAvatar for transcript sync.
     * Called when user.transcription is received from LiveKit agent-response.
     */
    reportUserMessage(text) {
        if (!this.sessionInfo?.session_id || !text?.trim()) {
            return;
        }
        fetch(`${this.config.serverUrl}/v1/streaming.user_message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.config.apiKey,
            },
            body: JSON.stringify({
                session_id: this.sessionInfo.session_id,
                text: text.trim(),
            }),
        }).catch(() => {});
    }

    async createSession() {
        await this.getSessionToken();
        await this.startSession();

        this.createRoom();
        this.handleRoomEvents();

        await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);
    }

    async startStreaming() {
        if (!this.sessionInfo) {
            await this.createSession();
        }

        // Connect to LiveKit room
        await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token);

        // Wait for room to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));

        document.dispatchEvent(new Event('streamSessionStarted'));
    }

    /**
     * Send text to avatar via LiveKit agent-control.
     * taskType "talk" -> avatar.speak_response (avatar generates LLM response)
     * taskType "repeat" -> avatar.speak_text (avatar speaks exact text)
     */
    async sendText(text, taskType = "repeat") {
        if (!this.sessionInfo?.session_id || !this.room?.localParticipant) {
            return;
        }

        const eventType = taskType === "talk" ? "avatar.speak_response" : "avatar.speak_text";
        const payload = {
            event_type: eventType,
            session_id: this.sessionInfo.session_id,
            text: text,
        };

        try {
            const data = new TextEncoder().encode(JSON.stringify(payload));
            this.room.localParticipant.publishData(data, {
                reliable: true,
                topic: Avatar.AGENT_CONTROL_TOPIC,
            });
        } catch (error) {
            // Silent error handling
        }
    }

    /**
     * Report avatar message to ilianaaiAvatar for transcript/Petya sync.
     */
    reportAvatarMessage(text) {
        if (!this.sessionInfo?.session_id || !text?.trim()) {
            return;
        }

        fetch(`${this.config.serverUrl}/v1/streaming.avatar_message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.config.apiKey,
            },
            body: JSON.stringify({
                session_id: this.sessionInfo.session_id,
                text: text.trim(),
            }),
        }).catch(() => {});
    }

    async closeSession() {
        if (!this.sessionInfo) {
            return;
        }

        try {
            await fetch(
                `${this.config.serverUrl}/v1/sessions/stop`,
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
        } catch (error) {
            // Silent error handling
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
            try {
                const rawData = new TextDecoder().decode(message);
                const eventData = JSON.parse(rawData);
                const topicStr = typeof topic === 'string' ? topic : (topic ?? '');
                const isAgentResponse = topicStr === Avatar.AGENT_RESPONSE_TOPIC ||
                    ['avatar.speak_started', 'avatar.speak_ended', 'avatar.transcription', 'user.transcription'].includes(eventData.event_type);
                if (isAgentResponse && eventData.event_type) {
                    this.handleAgentResponseEvent(eventData);
                    return;
                }
            } catch (error) {
                // Not JSON or other parse error - pass through
            }
            this.onDataReceived?.(message);
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
