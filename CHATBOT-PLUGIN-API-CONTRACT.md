# Chatbot-Plugin → ilianaaiAvatar: API Contract

This document describes exactly what the **chatbot-plugin** sends to ilianaaiAvatar. Use it when implementing or validating the ilianaaiAvatar service.

**Base URL:** The chatbot-plugin uses `avatarServiceUrl` from WordPress settings (e.g. `https://avatar.ilianaai.com`). All paths below are relative to that base.

---

## Authentication

All requests use the same header:

```
X-Api-Key: <customer_api_key>
```

The API key identifies the customer/account. It comes from the WordPress Chatbot Settings and is the same key used for SellEmbedded.

---

## Request Sequence (Typical Session Flow)

1. `POST /v1/streaming.create_token`
2. `POST /v1/streaming.new`
3. WebSocket connect to `wss://{host}/v1/ws/streaming.chat`
4. `POST /v1/streaming.start`
5. [Multiple] `POST /v1/streaming.task` (text messages)
6. `POST /v1/streaming.stop` (when user closes chat)

---

## REST Endpoints

### 1. Create Session Token

**Request:**
```
POST {baseUrl}/v1/streaming.create_token
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:** None (empty)

**Expected response:** Same as Heygen — JSON with `data.token`:
```json
{ "data": { "token": "..." } }
```

---

### 2. Create Session (streaming.new)

**Request:**
```
POST {baseUrl}/v1/streaming.new
Accept: application/json
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "quality": "medium",
  "version": "v2",
  "conversation_id": "<sell_embedded_conversation_id>"
}
```

- `conversation_id` may be `null` or a string (SellEmbedded conversation ID). Used for updateConversationStatus when session ends.

**Expected response:** Heygen shape plus optional `intro`:
```json
{
  "data": {
    "session_id": "...",
    "url": "...",
    "access_token": "...",
    "intro": "Hello and welcome. How can I help you today?"
  }
}
```

- `session_id`, `url`, `access_token` — required (same as Heygen).
- `intro` — optional. If present, the plugin uses it for the initial greeting; otherwise uses a default.

---

### 3. Start Streaming

**Request:**
```
POST {baseUrl}/v1/streaming.start
Content-Type: application/json
X-api-key: <customer_api_key>
```

**Note:** Header is `X-api-key` (lowercase `key`), not `X-Api-Key`.

**Body:**
```json
{
  "session_id": "<from streaming.new>"
}
```

---

### 4. Send Text to Avatar (streaming.task)

**Request:**
```
POST {baseUrl}/v1/streaming.task
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "session_id": "<from streaming.new>",
  "text": "<user or bot text>",
  "task_type": "talk" | "repeat"
}
```

- `task_type: "talk"` — user message, avatar generates response (STT disabled; text comes from Whisper).
- `task_type: "repeat"` — avatar speaks the text exactly (used for intro and bot replies).

**Typical usage:**
- Intro: `{ text: "...", task_type: "repeat" }`
- User message: `{ text: "...", task_type: "talk" }`
- Bot response: `{ text: "...", task_type: "repeat" }`

---

### 5. Stop Session

**Request:**
```
POST {baseUrl}/v1/streaming.stop
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "session_id": "<from streaming.new>"
}
```

---

## WebSocket

**URL:**
```
wss://{host}/v1/ws/streaming.chat?session_id=...&session_token=...&silence_response=false&opening_text=&stt_language=en&enable_tts=true&enable_stt=false
```

**Query parameters (exact):**

| Param           | Value                      |
|----------------|----------------------------|
| session_id     | From streaming.new         |
| session_token  | From streaming.create_token|
| silence_response | false                   |
| opening_text   | ""                         |
| stt_language   | "en"                       |
| enable_tts     | true                       |
| enable_stt     | false                      |

**Expected WebSocket messages (from Heygen → plugin):**

The plugin handles these event types:

- `avatar_talking_message` — streaming text while avatar speaks (`message` or `text`).
- `avatar_end_message` — final text when avatar finishes (`message` or `text`).
- `avatar_speech_start` / `avatar_speech_end` — used for UI state.

ilianaaiAvatar must forward these from Heygen to the client without changing format.

---

## LiveKit

After `streaming.start`, the plugin connects to LiveKit using `url` and `access_token` from the `streaming.new` response. That connection goes **directly to Heygen’s LiveKit** (via the URL in the response), not through ilianaaiAvatar.

ilianaaiAvatar should pass through Heygen’s `url` and `access_token` unchanged.

---

## CORS

The plugin runs in the browser on customer sites (various origins). ilianaaiAvatar must:

- Allow those origins (or `*` for development).
- Allow methods: `GET`, `POST`, `OPTIONS`.
- Allow headers: `Content-Type`, `X-Api-Key`, `X-api-key`, `Authorization`.

---

## Error Handling

The plugin does not handle REST errors in detail. If a request fails, the session will not start or will fail in place. Return appropriate HTTP status codes (401, 4xx, 5xx) and JSON error bodies for debugging.
