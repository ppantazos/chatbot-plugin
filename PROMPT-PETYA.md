# Petya Backend: Avatar Integration Changes

Use this prompt when implementing the required changes in the **Petya** (main backend) repository.

---

## Context

We have refactored the chatbot-plugin to use an isolated **ilianaaiAvatar** service instead of calling Heygen directly. ilianaaiAvatar proxies all Heygen API calls and will call Petya for:

1. **Avatar config lookup** — When a customer (identified by API key) starts a session, ilianaaiAvatar needs `avatarId`, `intro`, `knowledgeBaseId`, `voiceId` for that customer.
2. **updateConversationStatus** — When an avatar session ends, ilianaaiAvatar builds a transcript from the session and must call Petya to update the conversation with that transcript.

---

## Tasks

### 1. Avatar Config Endpoint (for ilianaaiAvatar)

Create an endpoint that returns avatar configuration for a customer identified by API key.

**Suggested route:** `GET /api/v1/avatar/config` or similar (align with existing Petya API patterns)

**Authentication:** ilianaaiAvatar will pass the customer API key (e.g. in `X-Api-Key` or `Authorization: Bearer <apiKey>` header). Petya validates this and looks up the customer.

**Response (example):**
```json
{
  "avatarId": "Katya_Chair_Sitting_public",
  "intro": "Hello and welcome. How can I help you today?",
  "knowledgeBaseId": null,
  "voiceId": null
}
```

**Requirements:**
- Look up the customer/account by API key in your database.
- Return the avatar configuration stored for that account.
- Use sensible defaults (e.g. `avatarId`, `intro`) if no custom config exists.
- Return 401 if the API key is invalid.

---

### 2. updateConversationStatus Endpoint

Create an endpoint that ilianaaiAvatar calls when an avatar session ends, to store the session transcript and update conversation status.

**Suggested route:** `POST /api/v1/avatar/conversations/:conversationId/status` or similar (align with Petya patterns)

**Authentication:** ilianaaiAvatar will authenticate (e.g. service-to-service token or shared secret). Define how ilianaaiAvatar authenticates to Petya.

**Request body (example):**
```json
{
  "sessionId": "heygen_session_xxx",
  "status": "completed",
  "transcript": [
    { "role": "user", "transcript": "Hello, how are you?", "timestamp": 1234567890 },
    { "role": "avatar", "transcript": "I'm doing well, thanks!", "timestamp": 1234567891 }
  ]
}
```

**Requirements:**
- Accept `sessionId` (Heygen session ID), `status`, and `transcript` array.
- Update the conversation record in MongoDB (same DB used by Petya).
- Link the conversation to the `sessionId` for analytics/billing.
- Return 200 on success, appropriate errors on failure.

---

### 3. MongoDB / Data Model

Ensure the following are supported:

- **Conversation** records that can store:
  - `sessionId` (Heygen/avatar session ID)
  - `transcript` (array of user/avatar turns)
  - `status` (e.g. active, completed)

- **Customer/Account** records that store avatar config:
  - `avatarId`
  - `intro`
  - `knowledgeBaseId`
  - `voiceId`
  - Linked to API key for lookup

Adjust schema as needed to fit your existing Petya structure.

---

### 4. CORS / Network

Ensure Petya allows requests from the ilianaaiAvatar service origin (or configure CORS appropriately for server-to-server calls if they are same-origin or use internal network).

---

## Integration Notes

- **chatbot-plugin** no longer calls Heygen directly; it calls ilianaaiAvatar with the customer API key.
- **ilianaaiAvatar** will call Petya for config (before calling Heygen) and for updateConversationStatus (after session ends).
- Share the exact endpoint URLs, auth mechanism, and request/response shapes with the ilianaaiAvatar implementation so it can integrate correctly.
