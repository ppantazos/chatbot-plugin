# ilianaaiAvatar: New Service Implementation

Use this prompt when creating the **ilianaaiAvatar** service from scratch. This service proxies all Heygen API calls and manages avatar sessions for customers (e.g. chatbot-plugin embedded on their sites).

---

## Purpose

- **Proxy** all Heygen streaming API calls (`api.heygen.com`) so clients never call Heygen directly.
- **Authenticate** customers via API key (X-Api-Key or Authorization header).
- **Look up** avatar config (avatarId, intro, etc.) from Petya for each customer.
- **Store** conversation/session mapping in Petya's MongoDB.
- **Build transcript** from session events and call Petya's `updateConversationStatus` when the session ends.

---

## Architecture

```
chatbot-plugin (browser) → ilianaaiAvatar → Heygen API
                              ↓
                        Petya (config + updateConversationStatus)
                              ↓
                        MongoDB (Petya's DB)
```

---

## Tech Stack Recommendation

- **Runtime:** Node.js
- **Framework:** Express or Fastify
- **WebSocket:** `ws` for proxying Heygen WebSocket
- **HTTP client:** `node-fetch` or `axios` for proxying Heygen REST
- **MongoDB driver:** `mongodb` (optional, if ilianaaiAvatar writes directly to DB; otherwise Petya handles all DB writes)

---

## Heygen Endpoints to Proxy

Proxy these Heygen API calls. Client sends same path/body; ilianaaiAvatar forwards to Heygen with its own `HEYGEN_API_KEY`.

| Heygen endpoint | Method | ilianaaiAvatar route | Notes |
|-----------------|--------|----------------------|-------|
| `/v1/streaming.create_token` | POST | Same path | Forward to Heygen, return token |
| `/v1/streaming.new` | POST | Same path | **Inject** avatar_id, knowledge_base_id from Petya config; **add** intro to response |
| `/v1/streaming.start` | POST | Same path | Forward session_id |
| `/v1/streaming.task` | POST | Same path | Forward; **collect** user text for transcript |
| `/v1/streaming.stop` | POST | Same path | Forward; **then** build transcript, call Petya updateConversationStatus |
| `wss://api.heygen.com/v1/ws/streaming.chat` | WebSocket | Same path | **Proxy** WebSocket; **collect** avatar_talking_message, avatar_end_message for transcript |

---

## Route Structure

Use base path `/api/v1/avatar` for all avatar routes, then mirror Heygen paths:

```
POST   /api/v1/avatar/v1/streaming.create_token
POST   /api/v1/avatar/v1/streaming.new
POST   /api/v1/avatar/v1/streaming.start
POST   /api/v1/avatar/v1/streaming.task
POST   /api/v1/avatar/v1/streaming.stop
WS     /api/v1/avatar/v1/ws/streaming.chat
```

**OR** expose at root for simpler client URLs (chatbot-plugin uses `serverUrl` as base):

```
POST   /v1/streaming.create_token
POST   /v1/streaming.new
...
WS     /v1/ws/streaming.chat
```

Choose based on your deployment (reverse proxy, etc.). The chatbot-plugin will use `avatarServiceUrl` (e.g. `https://avatar.ilianaai.com`) as the base, so paths are relative to that.

---

## Request Flow

### 1. streaming.create_token

- Client: `POST {base}/v1/streaming.create_token` with `X-Api-Key: <customer_api_key>`
- ilianaaiAvatar: Validate API key (optional: verify with Petya), forward to Heygen with `HEYGEN_API_KEY`
- Return Heygen response (token) to client

### 2. streaming.new (Create Session)

- Client: `POST {base}/v1/streaming.new` with body `{ quality, version, conversation_id }` (conversation_id from SellEmbedded, used for updateConversationStatus)
- ilianaaiAvatar:
  1. Call Petya config endpoint with customer API key → get `avatarId`, `intro`, `knowledgeBaseId`, `voiceId`
  2. Forward to Heygen with body `{ quality, version, avatar_id, knowledge_base_id }`
  3. Return Heygen response **plus** `intro` in the response (e.g. `data.intro`) so the client can use it
- Store `conversation_id` ↔ `session_id` in MongoDB (or pass to Petya) — need `conversation_id` from client; if not sent, generate or use session_id.

### 3. streaming.start, streaming.task

- Forward to Heygen with `HEYGEN_API_KEY`
- For streaming.task: append `{ role: "user", transcript: text }` to in-memory transcript for this session

### 4. WebSocket Proxy

- Client connects to ilianaaiAvatar WebSocket with `session_id`, `session_token` (from create_token + streaming.new)
- ilianaaiAvatar connects to Heygen WebSocket with same params
- Bidirectional forwarding of messages
- On `avatar_talking_message`, `avatar_end_message`: append to in-memory transcript for this session
- When WebSocket closes (or on streaming.stop): trigger transcript persist + updateConversationStatus

### 5. streaming.stop

- Forward to Heygen
- Build final transcript from collected user + avatar messages
- Call Petya `updateConversationStatus` with transcript
- Clean up in-memory transcript for this session

---

## Environment Variables

```env
HEYGEN_API_KEY=...
HEYGEN_BASE_URL=https://api.heygen.com
PETYA_BASE_URL=https://your-petya-backend.com
PETYA_AUTH_TOKEN=...          # or whatever ilianaaiAvatar uses to call Petya
MONGODB_URI=...               # if writing directly to Petya's MongoDB
```

---

## Petya Integration

### Config lookup

- `GET {PETYA_BASE_URL}/api/v1/avatar/config` (or whatever Petya implements)
- Header: `X-Api-Key: <customer_api_key>` (forward from client) or `Authorization: Bearer ${PETYA_AUTH_TOKEN}` if Petya uses service auth
- Response: `{ avatarId, intro, knowledgeBaseId, voiceId }`

### updateConversationStatus

- `POST {PETYA_BASE_URL}/api/v1/avatar/conversations/:conversationId/status` (or whatever Petya implements)
- Body: `{ sessionId, status: "completed", transcript: [...] }`
- Use Petya's auth mechanism (e.g. service token)

---

## conversation_id Handling

The chatbot-plugin uses SellEmbedded for `conversationId`. That may differ from Petya's conversation model. Options:

1. **Pass conversationId from client** — Add `conversation_id` to streaming.new request body; ilianaaiAvatar stores it and passes to updateConversationStatus.
2. **Use session_id as conversation_id** — Map Heygen session_id to a Petya conversation; Petya creates conversation on first updateConversationStatus call.
3. **Sync with SellEmbedded** — If SellEmbedded and Petya share concepts, align IDs.

Coordinate with Petya implementation.

---

## Transcript Format

Build transcript in a format Petya expects, e.g.:

```json
[
  { "role": "user", "transcript": "Hello", "absolute_timestamp": 1234567890 },
  { "role": "avatar", "transcript": "Hi there!", "absolute_timestamp": 1234567891 }
]
```

---

## CORS

Enable CORS for the chatbot-plugin origin (customer websites). Allow:
- `Origin` from config or `*` for development
- Methods: GET, POST, OPTIONS
- Headers: Content-Type, X-Api-Key, Authorization

---

## Project Structure (Suggested)

```
ilianaaiAvatar/
├── src/
│   ├── index.js           # Express app entry
│   ├── routes/
│   │   └── heygen.js      # Proxy routes
│   ├── services/
│   │   ├── heygen.js      # Heygen API client
│   │   ├── petya.js       # Petya API client (config, updateConversationStatus)
│   │   └── transcript.js  # Transcript builder
│   ├── proxy/
│   │   └── websocket.js   # WebSocket proxy
│   └── middleware/
│       └── auth.js        # API key extraction/validation
├── package.json
├── .env.example
└── README.md
```

---

## Chatbot-Plugin Compatibility

The chatbot-plugin sends:
- `X-Api-Key` on all avatar requests
- Body for streaming.new: `{ quality: "medium", version: "v2" }` (no avatar_id; you inject)
- Expects response from streaming.new to include `data.session_id`, `data.url`, `data.access_token`, and optionally `data.intro`
- Connects WebSocket to `wss://{your-host}/v1/ws/streaming.chat?session_id=...&session_token=...` (same query params as Heygen)

Ensure ilianaaiAvatar preserves Heygen's response shape for compatibility.
