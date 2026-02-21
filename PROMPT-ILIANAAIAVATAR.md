# ilianaaiAvatar: LiveAvatar Proxy Implementation

Use this prompt when creating or updating the **ilianaaiAvatar** service. This service proxies LiveAvatar API calls (replacing Heygen Interactive Avatar) and manages avatar sessions for customers (e.g. chatbot-plugin embedded on their sites).

**Why LiveAvatar:** HeyGen Interactive Avatar is being upgraded to LiveAvatar. LiveAvatar improves voice chat on both web and mobile (Heygen had known issues on mobile).

---

## Purpose

- **Proxy** LiveAvatar API calls (`api.liveavatar.com`) so clients never call LiveAvatar directly.
- **Authenticate** customers via API key (X-Api-Key or Authorization header).
- **Look up** avatar config (avatarId, voiceId, contextId, intro) from Petya for each customer.
- **Store** conversation/session mapping and call Petya's `updateConversationStatus` when the session ends.

---

## Architecture

```
chatbot-plugin (browser) → ilianaaiAvatar → LiveAvatar API (api.liveavatar.com)
                              ↓                    ↓
                        Petya (config)      LiveKit room (video/audio)
                              ↓                    ↑
                        updateConversationStatus    │
                                                   │
                        chatbot-plugin ←───────────┘
                        (connects to LiveKit directly with tokens from ilianaaiAvatar)
```

The plugin connects to LiveAvatar's LiveKit room using `livekit_url` and `livekit_client_token` returned by ilianaaiAvatar. Command events (avatar.speak_text, avatar.speak_response) and server events (avatar.transcription, etc.) flow through the LiveKit room—no WebSocket proxy needed.

---

## LiveAvatar Endpoints to Proxy

| LiveAvatar endpoint | Method | ilianaaiAvatar route | Notes |
|---------------------|--------|----------------------|-------|
| `/v1/sessions/token` | POST | `POST /v1/sessions/token` | **Inject** avatar_id, avatar_persona from Petya config |
| `/v1/sessions/start` | POST | `POST /v1/sessions/start` | Forward with `Authorization: Bearer <session_token>`; **add** intro to response |
| `/v1/sessions/stop` | POST | `POST /v1/sessions/stop` | Forward; **then** call Petya updateConversationStatus |
| `/v1/streaming.avatar_message` | POST | Same path | **Custom:** Client sends avatar text; ilianaaiAvatar stores and posts to Petya |

---

## Request Flow

### 1. Create Session Token

- Client: `POST {base}/v1/sessions/token` with `X-Api-Key`, body `{ conversation_id }`
- ilianaaiAvatar:
  1. Validate API key, fetch config from Petya → `avatarId`, `voiceId`, `contextId`, `intro`
  2. Call LiveAvatar `POST https://api.liveavatar.com/v1/sessions/token` with `X-API-KEY: LIVEAVATAR_API_KEY`, body:
     ```json
     {
       "mode": "FULL",
       "avatar_id": "<from Petya>",
       "avatar_persona": {
         "voice_id": "<from Petya or null>",
         "context_id": "<from Petya or null>",
         "language": "en"
       }
     }
     ```
  3. Return `{ data: { session_id, session_token } }` to client

### 2. Start Session

- Client: `POST {base}/v1/sessions/start` with `Authorization: Bearer <session_token>`
- ilianaaiAvatar: Forward to LiveAvatar with same Bearer token
- LiveAvatar returns `session_id`, `livekit_url`, `livekit_client_token`
- ilianaaiAvatar returns response **plus** `intro` in `data.intro` (from Petya config)

### 3. Client Connects to LiveKit

- Client uses `livekit_url` and `livekit_client_token` to connect to LiveAvatar's LiveKit room
- Client publishes command events to topic `agent-control`:
  - `avatar.speak_response` — user text → avatar generates LLM response
  - `avatar.speak_text` — avatar speaks exact text (intro, bot replies)
- Client receives server events on topic `agent-response`:
  - `avatar.speak_started`, `avatar.speak_ended`, `avatar.transcription`

### 4. streaming.avatar_message (Option A)

- Client: `POST {base}/v1/streaming.avatar_message` with `{ session_id, text }`
- ilianaaiAvatar: Store as avatar message, optionally post to Petya for transcript sync

### 5. Stop Session

- Client: `POST {base}/v1/sessions/stop` with `{ session_id }`
- ilianaaiAvatar: Forward to LiveAvatar; build transcript from collected messages; call Petya `updateConversationStatus`

---

## Environment Variables

```env
LIVEAVATAR_API_KEY=...
LIVEAVATAR_BASE_URL=https://api.liveavatar.com
PETYA_BASE_URL=https://your-petya-backend.com
PETYA_AUTH_TOKEN=...
MONGODB_URI=...               # optional, if writing directly
```

---

## Petya Integration

### Config lookup

- `GET {PETYA_BASE_URL}/api/v1/avatar/config`
- Header: `X-Api-Key: <customer_api_key>` (from client)
- Response: `{ avatarId, intro, knowledgeBaseId, voiceId }`
- Map `knowledgeBaseId` → `context_id` (LiveAvatar uses "Context" instead of "Knowledge Base")

### updateConversationStatus

- `POST {PETYA_BASE_URL}/api/v1/avatar/conversations/:conversationId/status`
- Body: `{ sessionId, status: "completed", transcript: [...] }`

---

## CORS

Allow: `Content-Type`, `X-Api-Key`, `Authorization`; methods: `GET`, `POST`, `OPTIONS`.

---

## Chatbot-Plugin Contract

See **CHATBOT-PLUGIN-API-CONTRACT.md** for the exact request/response shapes the plugin expects.
