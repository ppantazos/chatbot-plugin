export class SellEmbedded
{
    config = {};
    conversationId = null;
    visitorId = null;

    /**
     * @param {string} apiKey - Petya/Sell Embedded API key (per-tenant, from plugin settings)
     * @param {{ serverUrl?: string }} [options] - serverUrl overrides Petya API base (e.g. http://localhost:5000/api/v1 for local)
     */
    constructor(apiKey, options = {}) {
        this.serverUrl = (options.serverUrl || "https://app.sellembedded.com/api/v1").replace(/\/$/, '');
        this.apiKey = apiKey;
    }

    async initUserConversation() {
        const response = await fetch(
            `${this.serverUrl}/conversations/userConversation/init`,
            {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    visitorId: this.visitorId,
                }),
            }
        );

        const rawData = await response.json();
        if (!rawData.success || !rawData.data) {
            throw new Error(rawData.message || 'Failed to create conversation');
        }
        this.conversationId = rawData.data._id || rawData.data.id || null;
        if (!this.conversationId) {
            throw new Error('Conversation ID not returned from Petya');
        }
    }

    async completeUserConversation() {
        if (!this.conversationId) {
            return;
        }

        await fetch(
            `${this.serverUrl}/conversations/userConversation/${this.conversationId}/status`,
            {
                method: "PATCH",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    status: 'completed'
                }),
            }
        );

        this.conversationId = null;
    }

    async sendMessage(content, isFromUser) {
        if (!this.conversationId) {
            console.warn('[SellEmbedded] sendMessage skipped: no conversationId');
            return;
        }
        if (!content || typeof content !== 'string') {
            return;
        }

        const payload = {
            conversationId: this.conversationId,
            isFromUser: isFromUser,
            content: String(content).trim(),
        };

        const response = await fetch(
            `${this.serverUrl}/messages/userMessages/init`,
            {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(payload),
            }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.warn('[SellEmbedded] sendMessage failed:', response.status, data?.message || data);
            throw new Error(data?.message || `Failed to store message (${response.status})`);
        }
        return data;
    }

    async initVisitor({ ip, location = null, conversationId = null }) {
        const response = await fetch(
            `${this.serverUrl}/visitors/init`,
            {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    ip,
                    location,
                    conversationId,
                }),
            }
        );

        const rawData = await response.json();

        this.visitorId = rawData?.data?.id ?? null;

        return rawData;
    }

    async updateVisitorTalkedToChat({ visitorId = this.visitorId, talkedToChat }) {
        if (!visitorId) {
            throw new Error("visitorId is required to update talkedToChat status");
        }

        await fetch(
            `${this.serverUrl}/visitors/${visitorId}/talkedToChat`,
            {
                method: "PATCH",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    talkedToChat,
                }),
            }
        );
    }

    async getAccountConfig() {
        const response = await fetch(
            `${this.serverUrl}/account/config`,
            {
                method: "GET",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
            }
        );

        const rawData = await response.json();
        
        this.config = rawData?.data?.config ?? {};

        return this.config;
    }
}
