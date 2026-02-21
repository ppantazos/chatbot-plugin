import {Config} from "./config.js";
import {Avatar} from "./avatar.js";
import {Messages} from "./messages.js";
import {SellEmbedded} from "./sellEmbedded.js";
import {VoiceInput} from "./voiceInput.js";
import {OpenAIService} from "./openaiService.js";

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
    const openaiService = new OpenAIService(config.getOpenAIApiKey());
    
    const DEFAULT_INTRO = "Hello and welcome. How can I help you today?";
    const API_CONFIG = {
        serverUrl: sellEmbeddedConfig.avatarServiceUrl || "",
        apiKey: sellEmbeddedConfig.apiKey || "",
        intro: DEFAULT_INTRO
    };

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
    let transcriptionQuotaExhausted = false;

    // Per-session buffer for avatar text chunks
    let avatarTextBuffer = '';
    let avatarEndDebounceTimer = null;

    function sendAvatarMessageAndReset() {
        const fullAvatarText = avatarTextBuffer.trim();
        avatarTextBuffer = '';
        avatarEndDebounceTimer = null;
        if (fullAvatarText) {
            avatar.reportAvatarMessage?.(fullAvatarText);
            sellEmbeddedApi.sendMessage(fullAvatarText, false).catch(() => {});
        }
    }

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
            
            // Setup voice input callbacks
            voiceInput.onRecordingComplete = async (audioBlob) => {
                // Don't retry transcription if quota was exhausted (avoids repeated failed API calls)
                if (transcriptionQuotaExhausted) {
                    updateVoiceStatus("Voice unavailable - OpenAI quota exceeded", false);
                    if (!isMuted && voiceInput.isActive() && !isAmySpeaking) {
                        setTimeout(() => voiceInput.startRecording(), 500);
                    }
                    return;
                }
                // CRITICAL: Don't process if avatar is speaking - this prevents feedback loop
                if (isMuted || isProcessingAudio || isAmySpeaking) {
                    // Clear chunks to prevent processing stale audio
                    voiceInput.audioChunks = [];
                    // Restart recording only if avatar is not speaking
                    if (!isMuted && !isProcessingAudio && !isAmySpeaking && voiceInput.isActive()) {
                        setTimeout(async () => {
                            await voiceInput.startRecording();
                        }, 500);
                    }
                    return;
                }
                
                // Only process if we have meaningful audio (at least 2KB for better quality)
                if (audioBlob.size < 2048) {
                    // Too small, likely silence - restart recording
                    if (!isMuted && voiceInput.isActive() && !isAmySpeaking) {
                        setTimeout(async () => {
                            await voiceInput.startRecording();
                        }, 500);
                    }
                    return;
                }
                
                isProcessingAudio = true;
                updateVoiceStatus("Processing...", false);
                
                try {
                    // Transcribe audio using OpenAI Whisper
                    const transcribedText = await openaiService.transcribeAudio(audioBlob);
                    
                    if (transcribedText && transcribedText.trim().length > 3) {
                        // Display user message - this creates a separate user message element
                        messages.append(transcribedText);
                        messages.output('message', 'message--user');
                        
                        // Store user message in Petya (SellEmbedded)
                        sellEmbeddedApi.sendMessage(transcribedText, true).catch(() => {});
                        
                        // Add to conversation history
                        conversationHistory.push({ role: 'user', content: transcribedText });
                        
                        avatarTextBuffer = '';
                        avatar.sendText(transcribedText, "talk");
                    } else {
                        // No meaningful text - restart recording
                        isProcessingAudio = false;
                        if (!isMuted && voiceInput.isActive() && !isAmySpeaking) {
                            updateVoiceStatus("Please speak", true);
                            setTimeout(async () => {
                                await voiceInput.startRecording();
                            }, 500);
                        }
                    }
                } catch (error) {
                    isProcessingAudio = false;
                    if (error.code === 'insufficient_quota') {
                        transcriptionQuotaExhausted = true;
                        updateVoiceStatus("Voice unavailable - OpenAI quota exceeded", false);
                        if (!isMuted && voiceInput.isActive() && !isAmySpeaking) {
                            setTimeout(() => voiceInput.startRecording(), 1000);
                        }
                        return;
                    }
                    updateVoiceStatus("Error processing audio", false);
                    // Restart recording on other errors
                    if (!isMuted && voiceInput.isActive() && !isAmySpeaking) {
                        setTimeout(async () => {
                            updateVoiceStatus("Please speak", true);
                            await voiceInput.startRecording();
                        }, 1000);
                    }
                }
            };
            
            voiceInput.onError = (error) => {
                updateVoiceStatus("Microphone error - check permissions", false);
            };

            await sellEmbeddedApi.initUserConversation();
            API_CONFIG.conversationId = sellEmbeddedApi.conversationId;
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
    
    async function getOpenAIResponse(userMessage) {
        try {
            // DON'T set isAmySpeaking here - wait for avatar to actually start speaking
            // This ensures the flag is only set when avatar actually starts talking
            updateVoiceStatus("Processing response...", false);
            
            // Get streaming response from OpenAI
            const stream = await openaiService.chatCompletion(
                userMessage,
                conversationHistory.slice(0, -1), // Exclude the current message
                API_CONFIG.intro || DEFAULT_INTRO
            );
            
            let fullResponse = '';
            
            // Don't display OpenAI response in chat - let avatar_talking_message handle it
            // This prevents duplicate messages and ensures only avatar speech is shown
            await openaiService.parseStreamingResponse(
                stream,
                (chunk) => {
                    // Just accumulate the response, don't display it yet
                    fullResponse += chunk;
                },
                () => {
                    // Stream complete - don't display here, avatar will display via avatar_talking_message
                    
                    // Add to conversation history
                    conversationHistory.push({ role: 'assistant', content: fullResponse });
                    
                    avatarTextBuffer = '';
                    if (avatar && avatar.sessionInfo) {
                        avatar.sendText(fullResponse, "repeat");
                        // avatar.sendText(text, "talk");
                    }
                    
                    isProcessingAudio = false;
                    
                    // Resume recording will happen when avatar stops speaking (avatar_stop_talking event)
                },
                (error) => {
                    isAmySpeaking = false;
                    isProcessingAudio = false;
                    updateVoiceStatus("Error getting response", false);
                }
            );
        } catch (error) {
            isAmySpeaking = false;
            isProcessingAudio = false;
            updateVoiceStatus("Error getting response", false);
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
        transcriptionQuotaExhausted = false;
        conversationHistory = [];
        introSent = false; // Reset intro flag

        resetMuteButtonUi();
        updateVoiceStatus("Voice idle", false);

        stopAudioVisualizer();
        
        // Clean up voice input
        voiceInput.cleanup();

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
            const chunk = data.message || data.text || '';
            if (chunk) {
                avatarTextBuffer += chunk;
                // Show streaming text as avatar speaks in LEFT/GRAY box (bot message)
                if (!isAmySpeaking) {
                    messages.clearCurrent();
                }
                messages.append(chunk);
                messages.outputStreaming('message', 'message--bot');
            }
            return;
        }

        if (data.type === 'avatar_end_message') {
            const finalChunk = data.message || data.text || '';
            if (finalChunk) {
                avatarTextBuffer += finalChunk;
                messages.append(finalChunk);
            }
            // Only finalize display here. Report avatar only on avatar.speak_ended/avatar_stop_talking to avoid duplicates.
            messages.finalizeStreaming('message', 'message--bot');
            return;
        }

        // Handle avatar video/audio stream events
        if (data.type === 'avatar_start_talking') {
            if (avatarEndDebounceTimer) { clearTimeout(avatarEndDebounceTimer); avatarEndDebounceTimer = null; }
            avatarTextBuffer = '';
            // CRITICAL: Set flag FIRST, then stop recording
            isAmySpeaking = true;
            updateVoiceStatus("Amy is speaking...", true);
            
            // CRITICAL: Stop recording immediately when avatar starts speaking
            if (voiceInput.isRecording) {
                voiceInput.stopRecording().catch(() => {});
            }
            // Clear any pending audio chunks to prevent processing
            voiceInput.audioChunks = [];
            
            // Ensure we start a new bot message for avatar speech
            messages.clearCurrent();
            return;
        }

        if (data.type === 'avatar_stop_talking') {
            if (avatarEndDebounceTimer) { clearTimeout(avatarEndDebounceTimer); avatarEndDebounceTimer = null; }
            sendAvatarMessageAndReset();
            messages.finalizeStreaming('message', 'message--bot');

            // CRITICAL: Reset flags - required for voice "talk" flow
            isAmySpeaking = false;
            isProcessingAudio = false;
            updateVoiceStatus("Please speak", true);
            
            // Wait a bit before resuming to ensure avatar is fully done
            setTimeout(() => {
                // Double-check flag is still false before resuming
                if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !voiceInput.isRecording && !isProcessingAudio) {
                    voiceInput.startRecording().catch(() => {});
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
                    if (voiceInput.isRecording) {
                        voiceInput.stopRecording().catch(() => {});
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
                        // CRITICAL: Reset flags - required for voice "talk" flow
                        isAmySpeaking = false;
                        isProcessingAudio = false;
                        updateVoiceStatus("Please speak", true);
                        speakingStartTime = null;
                        avatar.onAvatarSpeechEnd?.();
                        
                        // Wait a bit before resuming recording
                        setTimeout(() => {
                            // Double-check flag is still false before resuming
                            if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !voiceInput.isRecording && !isProcessingAudio) {
                                voiceInput.startRecording().catch(() => {});
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
        if (avatarEndDebounceTimer) { clearTimeout(avatarEndDebounceTimer); avatarEndDebounceTimer = null; }
        avatarTextBuffer = '';
        // CRITICAL: Set flag FIRST, then stop recording
        isAmySpeaking = true;
        updateVoiceStatus("Amy is speaking...", true);
        
        // CRITICAL: Stop recording immediately when avatar starts speaking
        if (voiceInput.isRecording) {
            voiceInput.stopRecording().catch(() => {});
        }
        // Clear any pending audio chunks to prevent processing
        voiceInput.audioChunks = [];
        
        // Ensure we start a new bot message for avatar speech
        messages.clearCurrent();
    };

    avatar.onAvatarSpeechEnd = () => {
        if (avatarEndDebounceTimer) { clearTimeout(avatarEndDebounceTimer); avatarEndDebounceTimer = null; }
        sendAvatarMessageAndReset();
        messages.finalizeStreaming('message', 'message--bot');

        // CRITICAL: Reset flags - required for voice "talk" flow where we never use getOpenAIResponse
        isAmySpeaking = false;
        isProcessingAudio = false;
        updateVoiceStatus("Please speak", true);
        
        // Wait a bit before resuming to ensure avatar is fully done
        setTimeout(() => {
            // Double-check flag is still false before resuming
            if (!isMuted && !isAmySpeaking && voiceInput.isActive() && !voiceInput.isRecording && !isProcessingAudio) {
                voiceInput.startRecording().catch(() => {});
            }
        }, 500);
    };

    // Track if intro has been sent to prevent duplicates
    let introSent = false;
    
    document.addEventListener('streamSessionStarted', async () => {
        isSessionActive = true;
        isSessionStarting = false;
        introSent = false; // Reset intro flag for new session
        
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
                await voiceInput.startRecording();
                updateVoiceStatus("Please speak", true);
            } catch (error) {
                updateVoiceStatus("Microphone error", false);
            }
        }

        // Send intro message only once per session (from ilianaaiAvatar response or default)
        if (!introSent) {
            introSent = true;
            setTimeout(() => {
                avatarTextBuffer = '';
                const introMessage = avatar.sessionInfo?.intro || API_CONFIG.intro || DEFAULT_INTRO;
                avatar.sendText(introMessage, "repeat");
            }, 200);
        }
    });

    document.addEventListener('streamSessionClosed', () => {
        isSessionActive = false;
        isSessionStarting = false;

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
        
        // Clean up voice input
        voiceInput.cleanup();

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
                if (voiceInput.isRecording) {
                    await voiceInput.stopRecording();
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
                        await voiceInput.startRecording();
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
                // Display user message
                messages.append(text);
                messages.output('message', 'message--user');
                
                // Store user message in Petya (SellEmbedded)
                sellEmbeddedApi.sendMessage(text, true).catch(() => {});
                
                // Add to conversation history
                conversationHistory.push({ role: 'user', content: text });
                avatarTextBuffer = '';
                avatar.sendText(text, "talk");
                // Get response from OpenAI
                // await getOpenAIResponse(text);
                
                taskInput.value = "";
            }
        });
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
