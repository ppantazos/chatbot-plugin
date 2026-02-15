export class Messages
{
    chatContainer = null;
    messageParts = [];
    currentStreamingElement = null;


    constructor(chatContainer) {
        this.chatContainer = chatContainer;
        this.messageParts = [];
        this.currentStreamingElement = null;
    }

    append(part) {
        this.messageParts.push(part);
    }

    reset() {
        this.messageParts = [];
    }

    clearHistory() {
        if (this.chatContainer) {
            this.chatContainer.innerHTML = "";
        }
        this.currentStreamingElement = null;
        this.reset();
    }

    getMessageParts() {
        return this.messageParts;
    }

    output(...classTokens) {
        const paragraph = document.createElement("p");
        paragraph.classList.add(...classTokens);
        paragraph.textContent = this.messageParts.join('');
        this.chatContainer.appendChild(paragraph);

        this.reset();
    }

    outputStreaming(...classTokens) {
        // Create streaming element if it doesn't exist
        if (!this.currentStreamingElement) {
            this.currentStreamingElement = document.createElement("p");
            this.currentStreamingElement.classList.add(...classTokens);
            this.currentStreamingElement.textContent = '';
            this.chatContainer.appendChild(this.currentStreamingElement);
        }

        // Update the streaming element with current message parts
        this.currentStreamingElement.textContent = this.messageParts.join('');
        
        // Scroll to bottom to show the streaming text
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    finalizeStreaming(...classTokens) {
        // Finalize the streaming message and reset for next message
        if (this.currentStreamingElement) {
            this.currentStreamingElement = null;
        }
        this.reset();
    }

    clearCurrent() {
        // Clear current streaming element and message parts to start fresh
        // This is used when switching between user and bot messages
        if (this.currentStreamingElement) {
            this.currentStreamingElement = null;
        }
        this.reset();
    }
}
