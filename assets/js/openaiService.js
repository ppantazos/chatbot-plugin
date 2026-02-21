/**
 * OpenAI Service for Whisper STT and Chat Completion
 */
export class OpenAIService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.openai.com/v1';
    }

    /**
     * Convert audio blob to text using OpenAI Whisper
     * @param {Blob} audioBlob - Audio blob to transcribe
     * @returns {Promise<string>} - Transcribed text
     */
    async transcribeAudio(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-1');
            formData.append('language', 'en');

            const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const err = new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
                err.code = errorData.error?.code;
                throw err;
            }

            const data = await response.json();
            return data.text?.trim() || '';
        } catch (error) {
            throw error;
        }
    }

    /**
     * Send chat message to OpenAI and get response
     * @param {string} userMessage - User's message
     * @param {Array} conversationHistory - Previous conversation messages
     * @param {string} systemPrompt - System prompt for the conversation
     * @returns {Promise<ReadableStream>} - Streaming response
     */
    async chatCompletion(userMessage, conversationHistory = [], systemPrompt = 'You are a helpful AI assistant.') {
        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: userMessage }
            ];

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: messages,
                    stream: true,
                    temperature: 0.7,
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            return response.body;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Parse streaming response from OpenAI
     * @param {ReadableStream} stream - Streaming response
     * @param {Function} onChunk - Callback for each chunk of text
     * @param {Function} onComplete - Callback when stream completes
     * @param {Function} onError - Callback for errors
     */
    async parseStreamingResponse(stream, onChunk, onComplete, onError) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    onComplete?.();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            onComplete?.();
                            return;
                        }

                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                onChunk?.(content);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } catch (error) {
            onError?.(error);
        } finally {
            reader.releaseLock();
        }
    }
}
