import {Config} from "./config.js";
import {Avatar} from "./avatar.js";
import {Messages} from "./messages.js";
import {SellEmbedded} from "./sellEmbedded.js";
import {VoiceInput} from "./voiceInput.js";
import {WebSpeechService} from "./webSpeechService.js";

// This runs immediately after module loads

// Wait for DOM and ensure button exists
async function waitForElement(id, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = document.getElementById(id);
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
}

// Module scripts load deferred; when they run, DOMContentLoaded may have already fired (e.g. script in footer).
// So we must run init either when DOM is ready or immediately if it's already loaded.
async function initChatbot() {
    try {
        // const sellEmbeddedConfig = (new Config('main-chat-integration')).fetch();
        const config = new Config('main-chat-integration');
        const sellEmbeddedConfig = config.fetch();
        
    // DOM elements - Use getElementById for IDs (more reliable than querySelector)
    // Wait for critical elements to ensure they exist
    const startBtn = await waitForElement('start-button') || document.getElementById('start-button');
    const container = document.getElementById('chatbox');
    const mediaElement = document.getElementById('mediaElement');
    const closeBtn = document.getElementById('close-button');
    const taskInput = document.getElementById('task');
    const history = document.getElementById('chatbox-history');
    const form = document.getElementById('chatbox-form');
    const muteBtn = document.getElementById('mute-button');
    const voiceBtn = document.getElementById('voice-button');
    // Use getElementById for each bar individually (more reliable than querySelectorAll)
    const visualizerBars = [
        document.getElementById('visualizer-bar-1'),
        document.getElementById('visualizer-bar-2'),
        document.getElementById('visualizer-bar-3'),
        document.getElementById('visualizer-bar-4'),
        document.getElementById('visualizer-bar-5'),
        document.getElementById('visualizer-bar-6'),
        document.getElementById('visualizer-bar-7'),
        document.getElementById('visualizer-bar-8')
    ].filter(Boolean); // Filter out any null values

    const mediaStream = new MediaStream();
    const messages = new Messages(history)
    const sellEmbeddedApi = new SellEmbedded(sellEmbeddedConfig.apiKey, {
        serverUrl: sellEmbeddedConfig.petyaApiUrl || undefined,
    });
    
    // Initialize Voice Input (single point of truth)
    const voiceInput = new VoiceInput();
    const webSpeechService = new WebSpeechService();
    
    const DEFAULT_AVATAR_ID = null; // LiveAvatar requires UUID; set via account config (avatarId)
    const DEFAULT_INTRO = "Hello and welcome. How can I help you today?";
    const API_CONFIG = {
        serverUrl: sellEmbeddedConfig.avatarProxyUrl || "https://avatar.ilianaai.com",
        avatarId: DEFAULT_AVATAR_ID,
        knowledgeBaseId: null,
        contextId: null,
        voiceId: null,
        intro: DEFAULT_INTRO
    };

    await hydrateAccountConfig();
    const visitorInitPromise = kickOffVisitorInit();

    // Conversation history (used if LLM integration is added later)
    let conversationHistory = [];
    
    // Audio/session state
    let isMuted = false;
    let audioVisualizerInterval = null;
    let isListening = false;
    let isSessionActive = false;
    let isSessionStarting = false;
    let isProcessingAudio = false;
    let isAmySpeaking = false;
    let lastAvatarSpeechEndTime = 0;

    // Buffer to accumulate avatar response text for persisting to Petya
    let avatarResponseBuffer = '';

    /**
     * @param {Promise<MediaStream>|null} [micPromise] - On mobile, pass a promise started in the same sync turn as the tap so getUserMedia runs in user gesture context.
     */
    async function startFreshSession(micPromise = null) {
        // On mobile, await mic FIRST before any other await so the user gesture is still valid for getUserMedia
        if (micPromise) {
            try {
                await micPromise;
            } catch (micError) {
                const friendlyMsg = getMicErrorMessage(micError);
                updateVoiceStatus(friendlyMsg, false);
                throw new Error(friendlyMsg);
            }
        }

        await gracefullyCloseActiveSession();
        // On mobile we don't use getUserMedia; don't cleanup so we keep the running speech recognition
        resetUiStateForFreshSession(!!micPromise || voiceInput.isMobileDevice);

        if (container) {
            container.classList.add('open', 'is-loading');
        }

        try {
            // Initialize voice input (mic for visualizer) only on desktop; on mobile we leave mic to Web Speech API only
            try {
                if (voiceInput.isMobileDevice) {
                    // Skip getUserMedia on mobile so Speech Recognition gets exclusive mic
                } else if (!micPromise) {
                    await voiceInput.initialize();
                }
            } catch (micError) {
                const friendlyMsg = getMicErrorMessage(micError);
                updateVoiceStatus(friendlyMsg, false);
                throw new Error(friendlyMsg);
            }
            voiceInput.onError = (error) => {
                updateVoiceStatus("Microphone error - check permissions", false);
            };

            await visitorInitPromise;
            await sellEmbeddedApi.initUserConversation();
            await avatar.createSession();
            await avatar.startStreaming();
        } catch (error) {
            updateVoiceStatus("Failed to start session", false);
            if (container) {
                container.classList.remove('is-loading');
            }
            throw error;
        }
    }
    
    async function gracefullyCloseActiveSession() {
        const pendingTasks = [];

        if (avatar && (avatar.sessionInfo || avatar.room)) {
            pendingTasks.push(
                avatar.closeSession().catch((error) => {
                })
            );
        }

        if (sellEmbeddedApi && sellEmbeddedApi.conversationId) {
            pendingTasks.push(
                sellEmbeddedApi.completeUserConversation().catch((error) => {
                })
            );
        }

        if (pendingTasks.length) {
            await Promise.all(pendingTasks);
        }
    }

    /**
     * @param {boolean} [skipVoiceCleanup] - If true, do not call voiceInput.cleanup() (e.g. when reusing stream from micPromise on mobile).
     */
    function resetUiStateForFreshSession(skipVoiceCleanup = false) {
        if (messages) {
            messages.clearHistory();
        }

        isMuted = false;
        isListening = false;
        isProcessingAudio = false;
        isAmySpeaking = false;
        avatarResponseBuffer = '';
        conversationHistory = [];
        introSent = false; // Reset intro flag

        resetMuteButtonUi();
        updateVoiceStatus("Voice idle", false);

        stopAudioVisualizer();
        
        if (!skipVoiceCleanup) {
            voiceInput.cleanup();
            webSpeechService.cleanup();
        }

        if (mediaElement) {
            mediaElement.srcObject = null;
        }
    }


    function resetMuteButtonUi() {
        if (!muteBtn) return;
        muteBtn.classList.remove('muted');
        const textElement = document.getElementById('mute-button-text');
        if (textElement) textElement.textContent = 'Mute Mic';
        const iconElement = document.getElementById('mute-button-icon');
        if (iconElement) {
            iconElement.innerHTML = `
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            `;
        }
    }

    function onDataReceived(message) {
        const rawData = new TextDecoder().decode(message);
        let data;
        try {
            data = JSON.parse(rawData);
        } catch (error) {
            return;
        }

        // Handle avatar speech text messages
        if (data.type === 'avatar_talking_message' || data.type === 'avatar_end_message') {
            const chunk = (data.message || '').trim();
            if (!chunk) return;

            if (!isAmySpeaking) {
                isAmySpeaking = true;
                updateVoiceStatus("Iliana is speaking...", true);
                if (!voiceInput.isMobileDevice && webSpeechService.isAvailable()) webSpeechService.stop();
                voiceInput.audioChunks = [];
            }

            const bufBefore = avatarResponseBuffer;
            // Skip if this chunk is already in our buffer (duplicate)
            if (bufBefore.length > 0 && bufBefore.includes(chunk) && chunk.length > 20) {
                return;
            }
            // Replace when chunk is the FULL transcript: long, and either contains our buffer or overlaps significantly.
            // LiveAvatar may send partial first (mid-sentence) then full; full has minor text variations.
            const overlap = bufBefore.length > 30 && chunk.includes(bufBefore.slice(-40));
            const chunkIsFull = chunk.length > 100 && (
                chunk.includes(bufBefore) ||
                (bufBefore.length > 0 && overlap && chunk.length >= bufBefore.length)
            );
            if (chunkIsFull) {
                avatarResponseBuffer = chunk;
            } else {
                // Add space between chunks when trim() removed it (LiveAvatar may send "word1" "word2")
                const needsSpace = bufBefore.length > 0 && !/\s$/.test(bufBefore);
                avatarResponseBuffer += (needsSpace ? ' ' : '') + chunk;
            }
            // Display text as it arrives (streaming / typing effect) while the avatar is speaking
            if (bufBefore.length === 0) messages.clearCurrent();
            messages.reset();
            messages.append(avatarResponseBuffer);
            messages.outputStreaming('message', 'message--bot');
            return;
        }

        // LiveAvatar user.transcription — do NOT send to Petya here.
        // We already send user messages from webSpeechService.onTranscript (voice) and form submit (text).
        // Sending here would duplicate, since we send to avatar via sendText and LiveAvatar may echo.
        if (data.type === 'user_transcription') {
            return;
        }

        // Handle avatar video/audio stream events
        if (data.type === 'avatar_start_talking') {
            // Do NOT clear avatarResponseBuffer — transcription chunks often arrive BEFORE speak_started.
            // Clearing here wipes the beginning of the message when speak_started fires late.
            // CRITICAL: Set flag FIRST, then stop recording
            isAmySpeaking = true;
            updateVoiceStatus("Iliana is speaking...", true);
            
            if (!voiceInput.isMobileDevice && webSpeechService.isAvailable()) webSpeechService.stop();
            voiceInput.audioChunks = [];
            return;
        }

        if (data.type === 'avatar_stop_talking') {
            // CRITICAL: Reset flag FIRST
            isAmySpeaking = false;
            lastAvatarSpeechEndTime = Date.now();
            updateVoiceStatus("Please speak", true);

            // Finalize the streaming message with deduplicated text (already shown while speaking)
            if (avatarResponseBuffer.trim()) {
                let text = deduplicateAvatarMessage(avatarResponseBuffer.trim());
                messages.reset();
                messages.append(text);
                messages.outputStreaming('message', 'message--bot');
                sellEmbeddedApi.sendMessage(text, false).catch(() => {});
            }
            messages.finalizeStreaming('message', 'message--bot');
            avatarResponseBuffer = '';

            resumeListeningAfterAvatarStops();
            return;
        }
    }

    function onTrackSubscribed(track) {
        if (track.kind === "video" || track.kind === "audio") {
            mediaStream.addTrack(track.mediaStreamTrack);
            
            // If this is avatar audio, monitor it for speech detection
            if (track.kind === "audio" && track.source === LivekitClient.Track.Source.Camera) {
                // Monitor audio levels to detect when avatar is speaking
                setupAvatarAudioMonitoring(track.mediaStreamTrack);
            }
            
            if (mediaStream.getVideoTracks().length > 0 && mediaStream.getAudioTracks().length > 0) {
                mediaElement.srcObject = mediaStream;
                
                // On mobile, explicitly call play() after setting srcObject
                // This is required for audio playback on mobile browsers
                if (voiceInput.isMobileDevice && mediaElement) {
                    mediaElement.play().catch(() => {});
                }
            }
        }
    }
    
    // Monitor avatar audio to detect speech
    let avatarAudioAnalyser = null;
    let avatarAudioMonitoringInterval = null;
    
    function setupAvatarAudioMonitoring(audioTrack) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
            avatarAudioAnalyser = audioContext.createAnalyser();
            avatarAudioAnalyser.fftSize = 256;
            source.connect(avatarAudioAnalyser);
            
            let lastLevel = 0;
            let speakingStartTime = null;
            
            avatarAudioMonitoringInterval = setInterval(() => {
                const dataArray = new Uint8Array(avatarAudioAnalyser.frequencyBinCount);
                avatarAudioAnalyser.getByteFrequencyData(dataArray);
                
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const level = (sum / dataArray.length) / 255;
                
                if (level > 0.01 && lastLevel <= 0.01 && !isAmySpeaking) {
                    isAmySpeaking = true;
                    updateVoiceStatus("Iliana is speaking...", true);
                    if (!voiceInput.isMobileDevice && webSpeechService.isAvailable()) webSpeechService.stop();
                    voiceInput.audioChunks = [];
                    
                    // Ensure we start a new bot message for avatar speech
                    messages.clearCurrent();
                    avatar.onAvatarSpeechStart?.();
                }
                
                // Detect when avatar stops speaking (audio level drops)
                if (level <= 0.01 && lastLevel > 0.01 && isAmySpeaking) {
                    speakingStartTime = speakingStartTime || Date.now();
                    const silenceDuration = Date.now() - speakingStartTime;
                    
                    // Wait 500ms of silence before considering speech ended
                    if (silenceDuration > 500) {
                        isAmySpeaking = false;
                        updateVoiceStatus("Please speak", true);
                        speakingStartTime = null;
                        avatar.onAvatarSpeechEnd?.();
                    }
                } else if (level > 0.01) {
                    speakingStartTime = null; // Reset silence timer
                }
                
                lastLevel = level;
            }, 100);
        } catch (error) {
            // Silent error handling
        }
    }

    function onTrackUnsubscribe(track) {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack) {
            mediaStream.removeTrack(mediaTrack);
        }
    }

    function onDisconnect(reason) {
    }

    const avatar = new Avatar(
        API_CONFIG,
        onDataReceived,
        onTrackSubscribed,
        onTrackUnsubscribe,
        onDisconnect
    );

    // Set speech handlers once so we can start recognition in user gesture on mobile (iOS requires that)
    webSpeechService.onTranscript = (transcribedText) => {
        if (!isSessionActive || !avatar) return;
        if (isMuted || isProcessingAudio || isAmySpeaking) return;
        // Ignore transcripts shortly after avatar stopped (mic picks up speaker echo, e.g. "shall we begin?")
        if (Date.now() - lastAvatarSpeechEndTime < 1500) return;
        if (!transcribedText || transcribedText.trim().length < 2) return;
        isProcessingAudio = true;
        updateVoiceStatus("Processing...", false);
        const text = transcribedText.trim();
        messages.clearCurrent();
        messages.append(text);
        messages.output('message', 'message--user');
        sellEmbeddedApi.sendMessage(text, true).catch(() => {});
        conversationHistory.push({ role: 'user', content: text });
        avatar.sendText(text, "talk");
        isProcessingAudio = false;
    };
    webSpeechService.onError = (error) => {
        const msg = (error && error.message) ? error.message : "Microphone error";
        updateVoiceStatus(msg, false);
    };

    // Single entry point to start speech recognition (mic listening)
    function startSpeechRecognition() {
        if (isMuted || isAmySpeaking || isProcessingAudio || !webSpeechService.isAvailable()) return;
        if (!voiceInput.isMobileDevice && !voiceInput.isActive()) return;
        try {
            webSpeechService.start();
        } catch (e) {}
    }

    // Single entry point to resume listening after avatar stops (500ms delay)
    function resumeListeningAfterAvatarStops() {
        setTimeout(() => startSpeechRecognition(), 500);
    }

    // Avatar speech callbacks (WebSocket events)
    avatar.onAvatarSpeechStart = () => {
        isAmySpeaking = true;
        updateVoiceStatus("Iliana is speaking...", true);
        // On desktop we stop recognition when avatar speaks; on mobile we keep listening and ignore (restart often fails on iOS)
        if (!voiceInput.isMobileDevice && webSpeechService.isAvailable()) {
            webSpeechService.stop();
        }
        voiceInput.audioChunks = [];
        messages.clearCurrent();
    };

    avatar.onAvatarSpeechEnd = () => {
        isAmySpeaking = false;
        lastAvatarSpeechEndTime = Date.now();
        updateVoiceStatus("Please speak", true);
        if (!voiceInput.isMobileDevice) resumeListeningAfterAvatarStops();
    };

    // Track if intro has been sent to prevent duplicates
    let introSent = false;
    let keepAliveInterval = null;

    document.addEventListener('streamSessionStarted', async () => {
        isSessionActive = true;
        isSessionStarting = false;
        introSent = false; // Reset intro flag for new session

        // Keep session alive periodically to prevent idle timeout
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
        keepAliveInterval = setInterval(() => {
            if (avatar?.keepAlive) {
                avatar.keepAlive();
            }
        }, 60000);
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }

        container.classList.remove('is-loading');

        // On mobile, ensure audio context is resumed (required for audio playback)
        if (voiceInput.isMobileDevice && voiceInput.audioContext) {
            try {
                if (voiceInput.audioContext.state === 'suspended') {
                    await voiceInput.resumeAudioContext();
                }
            } catch (error) {
                // Silent error handling
            }
        }

        // Start audio visualizer
        startAudioVisualizer();

        if (isMuted) {
            updateVoiceStatus("Voice muted", true);
        } else {
            updateVoiceStatus("Please speak", true);
            // On desktop start recognition here (mic is ready). On mobile we already started in handleStart (same user gesture).
            if (!voiceInput.isMobileDevice) startSpeechRecognition();
        }

        // Send intro only if configured (disabled by default - LiveAvatar/Petya provides the greeting)
        const sendIntro = sellEmbeddedConfig.sendIntro === true;
        if (sendIntro && !introSent) {
            introSent = true;
            setTimeout(() => {
                const introMessage = API_CONFIG.intro || DEFAULT_INTRO;
                avatar.sendText(introMessage, "repeat");
            }, 200);
        }
    });

    document.addEventListener('streamSessionClosed', () => {
        isSessionActive = false;
        isSessionStarting = false;
        avatarResponseBuffer = '';
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }

        if (mediaElement) {
            mediaElement.srcObject = null;
        }
        container.classList.remove('open');

        stopAudioVisualizer();
        
        // Clean up avatar audio monitoring
        if (avatarAudioMonitoringInterval) {
            clearInterval(avatarAudioMonitoringInterval);
            avatarAudioMonitoringInterval = null;
        }
        if (avatarAudioAnalyser) {
            avatarAudioAnalyser = null;
        }
        
        // Clean up voice input and speech recognition
        voiceInput.cleanup();
        webSpeechService.cleanup();

        updateVoiceStatus("Voice stopped", false);
        isListening = false;
        isMuted = false;
        isProcessingAudio = false;
        isAmySpeaking = false;
        resetMuteButtonUi();

        if (sellEmbeddedApi) {
            sellEmbeddedApi.completeUserConversation().catch(() => {});
        }
    });


    // Helper: attach handler to both click and touchend (mobile)
    function addClickAndTouch(el, handler) {
        if (!el) return;
        el.addEventListener('click', handler);
        el.addEventListener('touchend', function (e) {
            handler(e);
            e.preventDefault();
        }, { passive: false });
    }

    // Mute button: toggle voice on/off (original functionality)
    if (muteBtn) {
        addClickAndTouch(muteBtn, function () {
            isMuted = !isMuted;
            if (isMuted) {
                muteBtn.classList.add('muted');
                const muteText = document.getElementById('mute-button-text');
                if (muteText) muteText.textContent = 'Unmute Mic';
                const muteIcon = document.getElementById('mute-button-icon');
                if (muteIcon) {
                    muteIcon.innerHTML = `<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>`;
                }
                updateVoiceStatus("Voice muted", false);
                if (webSpeechService.isAvailable()) webSpeechService.stop();
            } else {
                muteBtn.classList.remove('muted');
                const muteText = document.getElementById('mute-button-text');
                if (muteText) muteText.textContent = 'Mute Mic';
                const muteIcon = document.getElementById('mute-button-icon');
                if (muteIcon) {
                    muteIcon.innerHTML = `<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>`;
                }
                updateVoiceStatus("Please speak", true);
                startSpeechRecognition();
            }
        });
    }

    // Audio visualizer animation with real audio levels
    function animateVisualizer() {
        if (isMuted) {
            // When muted, show bars as if there's no sound (minimal height)
            visualizerBars.forEach((bar) => {
                if (bar) {
                    bar.style.height = '5%';
                    bar.style.background = 'linear-gradient(to top, #6b7280, #9ca3af)'; // Gray for muted state
                }
            });
            return;
        }

        if (voiceInput && voiceInput.analyser) {
            const audioLevel = voiceInput.getAudioLevel();
            const baseLevel = audioLevel * 100;

            visualizerBars.forEach((bar) => {
                if (!bar) return;
                const variation = (Math.random() - 0.5) * 20; // Add some variation
                const height = Math.max(5, baseLevel + variation);
                bar.style.height = `${Math.min(100, height)}%`;

                // Color based on audio level
                if (height > 60) {
                    bar.style.background = 'linear-gradient(to top, #ef4444, #f87171)'; // Red for high levels
                } else if (height > 30) {
                    bar.style.background = 'linear-gradient(to top, #f59e0b, #fbbf24)'; // Orange for medium
                } else {
                    bar.style.background = 'linear-gradient(to top, #10b981, #34d399)'; // Green for low
                }
            });
        } else {
            // Fallback to random animation if no audio context
            visualizerBars.forEach((bar) => {
                if (!bar) return;
                const randomHeight = Math.random() * 30 + 10; // Lower random levels
                bar.style.height = `${randomHeight}%`;
                bar.style.background = 'linear-gradient(to top, #10b981, #34d399)';
            });
        }
    }

    function startAudioVisualizer() {
        stopAudioVisualizer();
        audioVisualizerInterval = setInterval(animateVisualizer, 100); // Faster updates
    }

    function stopAudioVisualizer() {
        if (audioVisualizerInterval) {
            clearInterval(audioVisualizerInterval);
            audioVisualizerInterval = null;
        }
    }


    // Remove duplicate content from avatar message (LiveAvatar may send partial + full transcript)
    function deduplicateAvatarMessage(text) {
        // If text contains a clear intro marker and duplicates, keep only the complete part
        const introMarker = "Hi -- I'm Iliana";
        if (text.includes(introMarker)) {
            const idx = text.indexOf(introMarker);
            const fromIntro = text.slice(idx);
            // If the part from intro is substantial and the original had content before it, likely a duplicate
            if (fromIntro.length > 50 && idx > 20) {
                return fromIntro.trim();
            }
        }
        // Look for long repeated phrase (e.g. "conversations into structured sales opportunities")
        const repeatPhrase = "conversations into structured sales opportunities";
        if (text.split(repeatPhrase).length > 2) {
            const lastIdx = text.lastIndexOf(repeatPhrase);
            return text.slice(lastIdx).trim();
        }
        return text;
    }

    // Turn mic/getUserMedia errors into messages that explain why the prompt might not show
    function getMicErrorMessage(error) {
        if (!error) return '';
        const msg = (error.message && String(error.message)) || '';
        const name = (error.name && String(error.name)) || '';
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            return 'Microphone requires HTTPS. Open this site via https:// to see the permission prompt.';
        }
        if (name === 'NotAllowedError' || /permission denied|not allowed|denied/i.test(msg)) {
            return 'Microphone blocked. Allow microphone for this site in your browser or device settings, then reload and try again.';
        }
        if (/https|secure|getusermedia/i.test(msg)) return msg;
        return msg || 'Microphone access failed. Use HTTPS and allow microphone when prompted.';
    }

    // Voice status update function
    function updateVoiceStatus(message, isActive) {
        const voiceStatus = document.getElementById('voice-status');

        // Check if voiceStatus element exists
        if (!voiceStatus) {
            return;
        }

        const statusText = document.getElementById('voice-status-text');
        const indicator = document.getElementById('voice-indicator');

        const hasMessage = (message && String(message).trim());
        if (statusText) {
            statusText.textContent = hasMessage || 'Please speak';
        }
        voiceStatus.classList.toggle('show', !!hasMessage);

        if (isActive) {
            voiceStatus.classList.add('active');
            if (indicator) {
                indicator.style.animation = 'pulse-voice 1.5s ease-in-out infinite';
            }
        } else {
            voiceStatus.classList.remove('active');
            if (indicator) {
                indicator.style.animation = 'none';
            }
        }
    }


    // Removed minimized avatar click handler since we don't use minimized state

    // Handle window close/unload events to ensure proper cleanup
    window.addEventListener('beforeunload', function (event) {
        if (sellEmbeddedApi) {
            // Use sendBeacon for reliable delivery during page unload
            try {
                sellEmbeddedApi.completeUserConversation();
            } catch (error) {
            }
        }
    });

    window.addEventListener('pagehide', function (event) {
        if (sellEmbeddedApi) {
            try {
                sellEmbeddedApi.completeUserConversation();
            } catch (error) {
            }
        }
    });

    // Also handle visibility change (tab switching, minimizing browser)
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && sellEmbeddedApi) {
            sellEmbeddedApi.completeUserConversation();
        }
    });

    // Function to attach button handler
    function attachButtonHandler(btn) {
        if (!btn) return false;
        
        // Visual indicator that code loaded (remove after testing)
        btn.style.border = '3px solid #10b981';
        setTimeout(() => {
            btn.style.border = '';
        }, 2000);
        
        // Run session start (used by both click and touch). On mobile, start mic in same sync turn as tap so getUserMedia has user gesture.
        async function handleStart(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (isSessionStarting) return;
            isSessionStarting = true;
            btn.disabled = true;

            // Show loading state immediately so user sees feedback (especially on mobile)
            if (container) {
                container.classList.add('open', 'is-loading');
            }

            // On mobile: do NOT use getUserMedia so Web Speech API has exclusive mic access (iOS
            // often returns no results when another consumer holds the mic). Start recognition in same user gesture.
            let micPromise = null;
            if (voiceInput.isMobileDevice) {
                if (webSpeechService.isAvailable() && !isMuted) {
                    try { webSpeechService.start(); } catch (err) { /* start in same gesture */ }
                }
            }

            try {
                await startFreshSession(micPromise);
            } catch (error) {
                if (container) {
                    container.classList.remove('is-loading');
                    container.classList.add('open'); // keep panel open so user can see error
                }
                isSessionStarting = false;
                btn.disabled = false;
                voiceInput.cleanup();
                webSpeechService.cleanup();
                const msg = getMicErrorMessage(error) || (error && error.message) || 'Failed to start';
                updateVoiceStatus(msg, false);
            }
        }

        // On mobile use touchend so the full tap counts as user gesture (iOS/Safari often only show mic prompt for "complete" tap)
        if (voiceInput.isMobileDevice) {
            btn.addEventListener('touchstart', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (isSessionStarting) return;
                if (container) container.classList.add('open', 'is-loading');
            }, { passive: false });
            btn.addEventListener('touchend', function (e) {
                handleStart(e);
                e.preventDefault();
                e.stopPropagation();
            }, { passive: false });
        } else {
            btn.onclick = (e) => { handleStart(e); };
        }
        
        return true;
    }
    
    // CRITICAL: Verify button exists and attach handler
    if (startBtn) {
        attachButtonHandler(startBtn);
    } else {
        // Watch for button to be added dynamically
        const observer = new MutationObserver((mutations) => {
            const btn = document.getElementById('start-button');
            if (btn && !btn.onclick) {
                attachButtonHandler(btn);
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Also try alternative selectors immediately
        const altBtn = document.querySelector('button[id="start-button"]') || 
                      document.querySelector('#start-button') ||
                      document.querySelector('button[aria-label*="start"]');
        if (altBtn) {
            attachButtonHandler(altBtn);
            observer.disconnect();
        }
    }

    // Close button - use both click and touchend so it works on mobile
    async function handleClose(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        container.classList.remove('open', 'is-loading');
        if (startBtn) {
            startBtn.disabled = false;
        }
        isSessionStarting = false;
        await gracefullyCloseActiveSession();
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', handleClose);
        closeBtn.addEventListener('touchend', function (e) {
            handleClose(e);
            e.preventDefault();
        }, { passive: false });
    }

    if (form) {
        form.addEventListener('submit', async (evt) => {
            evt.preventDefault();

            const text = taskInput.value.trim();
            if (text) {
                messages.clearCurrent(); // Close any streaming message before new user message
                messages.append(text);
                messages.output('message', 'message--user');
                sellEmbeddedApi.sendMessage(text, true).catch(() => {});
                
                // Add to conversation history
                conversationHistory.push({ role: 'user', content: text });
                avatar.sendText(text, "talk");
                // Get response from OpenAI
                // await getOpenAIResponse(text);
                
                taskInput.value = "";
            }
        });
    }

    function isValidLiveAvatarUuid(value) {
        if (!value || typeof value !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
    }

    async function hydrateAccountConfig() {
        try {
            const accountConfig = await sellEmbeddedApi.getAccountConfig();
            const rawAvatarId = accountConfig?.avatarId ?? DEFAULT_AVATAR_ID;
            API_CONFIG.avatarId = isValidLiveAvatarUuid(rawAvatarId) ? rawAvatarId : (DEFAULT_AVATAR_ID ?? null);
            API_CONFIG.knowledgeBaseId = accountConfig?.knowledgeBaseId ?? null;
            API_CONFIG.contextId = accountConfig?.contextId ?? accountConfig?.knowledgeBaseId ?? null;
            API_CONFIG.voiceId = accountConfig?.voiceId ?? null;
            API_CONFIG.intro = accountConfig?.intro || DEFAULT_INTRO;
        } catch (error) {
            API_CONFIG.avatarId = DEFAULT_AVATAR_ID ?? null;
            API_CONFIG.intro = DEFAULT_INTRO;
        }
    }

    function kickOffVisitorInit() {
        return fetchVisitorMetadata()
            .then(({ip, location}) => {
                if (!ip) {
                    return null;
                }
                return sellEmbeddedApi.initVisitor({
                    ip,
                    location,
                    conversationId: sellEmbeddedApi.conversationId
                });
            })
            .catch(() => null);
    }

    async function fetchVisitorMetadata() {
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipPayload = await ipResponse.json();
            const ip = ipPayload?.ip;

            if (!isValidIp(ip)) {
                return {ip: null, location: 'unknown'};
            }

            let location = 'unknown';

            try {
                const locationResponse = await fetch(`https://ipapi.co/${ip}/json/`);
                if (locationResponse.ok) {
                    const locationPayload = await locationResponse.json();
                    const city = locationPayload?.city;
                    const country = locationPayload?.country_name || locationPayload?.country;
                    location = formatLocation(city, country);
                }
            } catch (error) {
                location = 'unknown';
            }

            return {ip, location};
        } catch (error) {
            return {ip: null, location: 'unknown'};
        }
    }

    function formatLocation(city, country) {
        if (city && country) {
            return `${city} - ${country}`;
        }

        if (country) {
            return country;
        }

        if (city) {
            return city;
        }

        return 'unknown';
    }

    function isValidIp(ip) {
        if (typeof ip !== 'string') {
            return false;
        }

        const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
        return ipv4Pattern.test(ip.trim());
    }

    // Toggle info message on click
    const chatInfoIcon = document.getElementById('chat-info-icon');
    const chatboxControls = document.getElementById('chatbox-controls');

    if (chatInfoIcon && chatboxControls) {
        chatInfoIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatboxControls.classList.toggle('showing-info');
        });
    }

    // Mobile: Resume AudioContext on any user interaction
    // This is critical for mobile browsers that suspend AudioContext until user interaction
    if (voiceInput.isMobileDevice) {
        const resumeAudioContext = async () => {
            await voiceInput.resumeAudioContext();
        };

        // Resume on various user interactions
        ['click', 'touchstart', 'touchend'].forEach(eventType => {
            document.addEventListener(eventType, resumeAudioContext, { once: true, passive: true });
        });

        // Also resume when chatbox opens
        if (container) {
            const observer = new MutationObserver(() => {
                if (container.classList.contains('open')) {
                    setTimeout(resumeAudioContext, 100);
                }
            });
            observer.observe(container, { attributes: true, attributeFilter: ['class'] });
        }
    }
    } catch (error) {
        // Init error (logging removed)
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
