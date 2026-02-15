<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Integrations\Theme;

use Inpsyde\Modularity\Properties\Properties;

class HtmlInjector
{
    public function __construct(private Properties $properties)
    {
    }

    public function inject(): void
    {
        $chatbotImageUrl = $this->properties->baseUrl() . '/assets/images/chatbot.png';
        
            echo '<div id="chatbox" class="">
                  <button type="button" id="start-button" aria-label="Click to start live chatting">
                    <img src="' . esc_url($chatbotImageUrl) . '" alt="" />
                    <span class="lets-talk-text">Let\'s talk</span>
                  </button>
        
              <div id="chatbox__inner">
                <!-- Left Panel: Avatar/Video + Audio Controls + Input -->
                <div class="avatar-section">
                  <!-- Video Area -->
                  <div class="video-container">
                    <video id="mediaElement" autoplay playsinline></video>
                    <div class="avatar-placeholder" style="display: none;">
                      <span>👋</span>
                    </div>
                    <!-- Close button -->
                    <button type="button" id="close-button" aria-label="Close live chatting">
                        &times;
                    </button>
                  </div>
                  
                  <!-- Audio Controls -->
                  <div class="audio-controls">
                        <button type="button" id="voice-button" class="audio-btn voice-activation" aria-label="Start voice recording">
                          <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          </svg>
                          <span class="btn-text">Click to Talk</span>
                        </button>
                    
                    <button type="button" id="mute-button" class="audio-btn" aria-label="Mute microphone">
                      <svg id="mute-button-icon" class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                      <span id="mute-button-text" class="btn-text">Mute</span>
                    </button>
                    
                    <div id="audio-visualizer" class="audio-visualizer">
                      <div id="visualizer-bar-1" class="visualizer-bar" style="height: 20%"></div>
                      <div id="visualizer-bar-2" class="visualizer-bar" style="height: 40%"></div>
                      <div id="visualizer-bar-3" class="visualizer-bar" style="height: 60%"></div>
                      <div id="visualizer-bar-4" class="visualizer-bar" style="height: 80%"></div>
                      <div id="visualizer-bar-5" class="visualizer-bar" style="height: 30%"></div>
                      <div id="visualizer-bar-6" class="visualizer-bar" style="height: 50%"></div>
                      <div id="visualizer-bar-7" class="visualizer-bar" style="height: 70%"></div>
                      <div id="visualizer-bar-8" class="visualizer-bar" style="height: 90%"></div>
                    </div>
                  </div>
                  
                  <!-- Input Area -->
                  <div class="input-area-left">
                    <form id="chatbox-form">
                      <input
                        id="task"
                        type="text"
                        placeholder="Type your message..."
                      />
                      <button type="submit" id="submit-button">Send</button>
                    </form>
                  </div>
                  
                  <!-- Call status for minimized state -->
                  <div class="call-status" id="call-status">
                    <div class="call-indicator"></div>
                    <span>Call Active</span>
                  </div>
                </div>
              
                <!-- Right Panel: Chat -->
                <div id="chatbox-controls">
                  <!-- Header -->
                  <div class="chat-header">
                    <h3 class="chat-title">Chat</h3>
                    <button type="button" id="chat-info-icon" class="chat-info-icon" aria-label="Toggle info message">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- Info Message (shown when toggled) -->
                  <div id="info-message-container" class="info-message-container">
                    <div class="message message--info">
                      To ensure precise recognition of names, email addresses, and other detailed information, we recommend typing your message..
                    </div>
                  </div>
                  
                  <!-- Conversation Area -->
                  <div id="chatbox-history"></div>
                  
                      <!-- Voice Status (for future speech functionality) -->
                      <div class="voice-status" id="voice-status">
                        <div id="voice-indicator" class="voice-indicator"></div>
                        <span id="voice-status-text">Click the microphone button above to enable voice chat</span>
                      </div>
                </div>
              </div>
                
            </div>';
    }
}
