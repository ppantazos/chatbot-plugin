export class SellEmbedded
{
    conversationId = null;
    visitorId = null;

    constructor(apiKey) {
        this.serverUrl = "https://app.sellembedded.com/api/v1";
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

        this.conversationId = rawData.data._id;
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
            return;
        }

        await fetch(
            `${this.serverUrl}/messages/userMessages/init`,
            {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    conversationId: this.conversationId,
                    isFromUser: isFromUser,
                    content: content,
                }),
            }
        );
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
}
