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

document.addEventListener('DOMContentLoaded', async function () {
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
    const sellEmbeddedApi = new SellEmbedded(sellEmbeddedConfig.apiKey);
    
    // Initialize Voice Input (single point of truth)
    const voiceInput = new VoiceInput();
    const webSpeechService = new WebSpeechService();
    
    const DEFAULT_AVATAR_ID = null; // LiveAvatar requires UUID; set via account config (avatarId)
    const DEFAULT_INTRO = "Hello and welcome. How can I help you today?";
    const API_CONFIG = {
        serverUrl: sellEmbeddedConfig.avatarProxyUrl || "http://localhost:3000",
        avatarId: DEFAULT_AVATAR_ID,
        knowledgeBaseId: null,
        contextId: null,
        voiceId: null,
        intro: DEFAULT_INTRO
    };

    await hydrateAccountConfig();
    kickOffVisitorInit();
    
    // Conversation history for OpenAI
    let conversationHistory = [];
    
    // Audio/session state
    let isMuted = false;
    let audioVisualizerInterval = null;
    let isListening = false;
    let isSessionActive = false;
    let isSessionStarting = false;
    let isProcessingAudio = false;
    let isAmySpeaking = false;

    // Buffer to accumulate avatar response text for persisting to Petya
    let avatarResponseBuffer = '';

    async function startFreshSession() {
        await gracefullyCloseActiveSession();
        resetUiStateForFreshSession();

        if (container) {
            container.classList.add('open', 'is-loading');
        }

        try {
            // Initialize voice input (single point of truth)
            // On mobile, this must happen within user gesture (button click)
            try {
                // On mobile, ensure we're in a user gesture context
                if (voiceInput.isMobileDevice) {
                    // Check if getUserMedia is available
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        throw new Error('getUserMedia not available. Please use HTTPS or localhost.');
                    }
                }
                
                await voiceInput.initialize();
            } catch (micError) {
                // On mobile, provide more helpful error message
                if (voiceInput.isMobileDevice) {
                    const errorMsg = micError.message || 'Unknown error';
                    updateVoiceStatus("Microphone permission required - please allow access", false);
                    throw new Error(`Microphone access denied: ${errorMsg}. Please allow microphone permissions and try again.`);
                } else {
                    throw micError;
                }
            }
            
            webSpeechService.onTranscript = (transcribedText) => {
                if (isMuted || isProcessingAudio || isAmySpeaking) return;
                if (!transcribedText || transcribedText.trim().length < 2) return;

                isProcessingAudio = true;
                updateVoiceStatus("Processing...", false);

                const text = transcribedText.trim();
                messages.clearCurrent(); // Close any streaming before new user message
                messages.append(text);
                messages.output('message', 'message--user');
                sellEmbeddedApi.sendMessage(text, true).catch(() => {});
                conversationHistory.push({ role: 'user', content: text });
                avatar.sendText(text, "talk");
                isProcessingAudio = false;
            };

            webSpeechService.onError = (error) => {
                updateVoiceStatus("Microphone error - check permissions", false);
            };

            voiceInput.onError = (error) => {
                updateVoiceStatus("Microphone error - check permissions", false);
            };

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

        if (avatar && (avatar.sessionInfo || avatar.room || avatar.webSocket)) {
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

    function resetUiStateForFreshSession() {
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
        
        // Clean up voice input and speech recognition
        voiceInput.cleanup();
        webSpeechService.cleanup();

        if (mediaElement) {
            mediaElement.srcObject = null;
        }
    }


    function resetMuteButtonUi() {
        if (!muteBtn) {
            return;
        }

        muteBtn.classList.remove('muted');
        const textElement = document.getElementById('mute-button-text');
        if (textElement) {
            textElement.textContent = 'Mute Mic';
        }

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
        if (data.type === 'avatar_talking_message') {
            // Accumulate for Petya persistence
            if (data.message) {
                avatarResponseBuffer += data.message;
            }
            // Show streaming text as avatar speaks in LEFT/GRAY box (bot message)
            // Start a new bot message if this is the first chunk
            if (data.message) {
                // Check if we need to start a new message (first chunk of avatar speech)
                if (!isAmySpeaking) {
                    // This is the start of avatar speech - create new bot message
                    messages.clearCurrent(); // Clear any current message buffer
                }
                messages.append(data.message);
                messages.outputStreaming('message', 'message--bot');
            }
            return;
        }

        if (data.type === 'avatar_end_message') {
            const finalChunk = data.message || '';
            const fullText = avatarResponseBuffer + finalChunk;
            if (finalChunk) {
                messages.clearCurrent(); // Start fresh to avoid appending to previous message
                messages.append(finalChunk);
                messages.outputStreaming('message', 'message--bot'); // Render avatar text
            }
            messages.finalizeStreaming('message', 'message--bot');
            if (fullText.trim()) {
                sellEmbeddedApi.sendMessage(fullText, false).catch(() => {});
            }
            avatarResponseBuffer = '';
            return;
        }

        // LiveAvatar user.transcription (when user's mic is in room)
        if (data.type === 'user_transcription' && data.message) {
            sellEmbeddedApi.sendMessage(data.message.trim(), true).catch(() => {});
            return;
        }

        // Handle avatar video/audio stream events
        if (data.type === 'avatar_start_talking') {
            // Reset buffer for new avatar turn
            avatarResponseBuffer = '';
            // CRITICAL: Set flag FIRST, then stop recording
            isAmySpeaking = true;
            updateVoiceStatus("Amy is speaking...", true);
            
            // CRITICAL: Stop recording immediately when avatar starts speaking
            if (webSpeechService.isAvailable()) {
                webSpeechService.stop();
            }
            // Clear any pending audio chunks to prevent processing
            voiceInput.audioChunks = [];
            
            // Ensure we start a new bot message for avatar speech
            messages.clearCurrent();
            return;
        }

        if (data.type === 'avatar_stop_talking') {
            // CRITICAL: Reset flag FIRST
            isAmySpeaking = false;
            updateVoiceStatus("Please speak", true);
            
            // Wait a bit before resuming to ensure avatar is fully done
            setTimeout(() => {
                if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !isProcessingAudio && webSpeechService.isAvailable()) {
                    webSpeechService.start();
                }
            }, 500);
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
                
                // Detect when avatar starts speaking (audio level increases)
                if (level > 0.01 && lastLevel <= 0.01 && !isAmySpeaking) {
                    // CRITICAL: Set flag FIRST, then stop recording
                    isAmySpeaking = true;
                    updateVoiceStatus("Amy is speaking...", true);
                    
                    // CRITICAL: Stop recording immediately
                    if (webSpeechService.isAvailable()) {
                        webSpeechService.stop();
                    }
                    // Clear any pending audio chunks
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
                        // CRITICAL: Reset flag FIRST
                        isAmySpeaking = false;
                        updateVoiceStatus("Please speak", true);
                        speakingStartTime = null;
                        avatar.onAvatarSpeechEnd?.();
                        
                        // Wait a bit before resuming recording
                        setTimeout(() => {
                            // Double-check flag is still false before resuming
                            if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !isProcessingAudio && webSpeechService.isAvailable()) {
                                webSpeechService.start();
                            }
                        }, 500);
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

    // Avatar speech callbacks (WebSocket events)
    avatar.onAvatarSpeechStart = () => {
        // CRITICAL: Set flag FIRST, then stop recording
        isAmySpeaking = true;
        updateVoiceStatus("Amy is speaking...", true);
        
        // CRITICAL: Stop recording immediately when avatar starts speaking
        if (webSpeechService.isAvailable()) {
            webSpeechService.stop();
        }
        // Clear any pending audio chunks to prevent processing
        voiceInput.audioChunks = [];
        
        // Ensure we start a new bot message for avatar speech
        messages.clearCurrent();
    };

    avatar.onAvatarSpeechEnd = () => {
        // CRITICAL: Reset flag FIRST
        isAmySpeaking = false;
        updateVoiceStatus("Please speak", true);
        
        // Wait a bit before resuming to ensure avatar is fully done
        setTimeout(() => {
            // Double-check flag is still false before resuming
            if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !isProcessingAudio && webSpeechService.isAvailable()) {
                webSpeechService.start();
            }
        }, 500);
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

        // Start continuous voice recording
        if (!isMuted && voiceInput.isActive()) {
            try {
                if (webSpeechService.isAvailable()) webSpeechService.start();
                updateVoiceStatus("Please speak", true);
            } catch (error) {
                updateVoiceStatus("Microphone error", false);
            }
        }

        // Send intro message only once per session
        if (!introSent) {
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


    // Mute button functionality - controls voice recording
    if (muteBtn) {
        muteBtn.addEventListener('click', async function () {
            isMuted = !isMuted;

            if (isMuted) {
                // Mute: stop recording
                muteBtn.classList.add('muted');
                const muteText = document.getElementById('mute-button-text');
                if (muteText) {
                    muteText.textContent = 'Unmute Mic';
                }
                const muteIcon = document.getElementById('mute-button-icon');
                if (muteIcon) {
                    muteIcon.innerHTML = `
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            `;
                }
                updateVoiceStatus("Voice muted", false);
                
                // Stop recording
                if (webSpeechService.isAvailable()) {
                    webSpeechService.stop();
                }
            } else {
                // Unmute: start recording
                isMuted = false;
                muteBtn.classList.remove('muted');
                const muteText = document.getElementById('mute-button-text');
                if (muteText) {
                    muteText.textContent = 'Mute Mic';
                }
                const muteIcon = document.getElementById('mute-button-icon');
                if (muteIcon) {
                    muteIcon.innerHTML = `
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            `;
                }
                updateVoiceStatus("Please speak", true);
                
                // Start recording if session is active and not processing
                if (isSessionActive && voiceInput.isActive() && !isProcessingAudio && !isAmySpeaking) {
                    try {
                        if (webSpeechService.isAvailable()) webSpeechService.start();
                    } catch (error) {
                        // Silent error handling
                    }
                }
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


    // Voice status update function
    function updateVoiceStatus(message, isActive) {
        const voiceStatus = document.getElementById('voice-status');

        // Check if voiceStatus element exists
        if (!voiceStatus) {
            return;
        }

        const statusText = document.getElementById('voice-status-text');
        const indicator = document.getElementById('voice-indicator');

        if (statusText) {
            statusText.textContent = message;
        }

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
        
        // ULTRA SIMPLE: Just make the button work - use direct onclick assignment
        btn.onclick = async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (isSessionStarting) {
                return false;
            }
            
            isSessionStarting = true;
            btn.disabled = true;
            
            try {
                await startFreshSession();
            } catch (error) {
                if (container) {
                    container.classList.remove('is-loading');
                }
                isSessionStarting = false;
                btn.disabled = false;
                
                // Clean up voice input on error
                voiceInput.cleanup();
            }
        };
        
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

    // Close button functionality - Direct close
    if (closeBtn) {
        closeBtn.addEventListener('click', async function () {
            await gracefullyCloseActiveSession();
        });
    } else {
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
        fetchVisitorMetadata()
            .then(({ip, location}) => {
                if (!ip) {
                    return;
                }

                sellEmbeddedApi
                    .initVisitor({
                        ip,
                        location,
                        conversationId: sellEmbeddedApi.conversationId
                    })
                    .then(() => {
                        // Visitor initialized
                    })
                    .catch(error => {
                    });
            })
            .catch(error => {
            });
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
            // Toggle the 'showing-info' class on the controls container
            // CSS handles the visibility switching
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
        // Silent error handling
    }
});
