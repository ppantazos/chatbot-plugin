# Chatbot-Plugin → ilianaaiAvatar: API Contract (LiveAvatar)

This document describes exactly what the **chatbot-plugin** sends to ilianaaiAvatar when using the **LiveAvatar** API. ilianaaiAvatar proxies LiveAvatar (api.liveavatar.com) instead of Heygen.

**Base URL:** The chatbot-plugin uses `avatarServiceUrl` from WordPress settings (e.g. `https://avatar.ilianaai.com`). All paths below are relative to that base.

---

## Authentication

All REST requests use:

```
X-Api-Key: <customer_api_key>
```

Except `POST /v1/sessions/start`, which uses:

```
Authorization: Bearer <session_token>
```

The API key identifies the customer/account. It comes from the WordPress Chatbot Settings and is the same key used for SellEmbedded.

---

## Request Sequence (Typical Session Flow)

1. `POST /v1/sessions/token` — create session token
2. `POST /v1/sessions/start` — start session (Bearer session_token)
3. Connect to LiveKit room using `livekit_url` and `livekit_client_token`
4. Publish command events to LiveKit topic `agent-control` (avatar.speak_text, avatar.speak_response)
5. Receive server events from LiveKit topic `agent-response`
6. [Per avatar reply] `POST /v1/streaming.avatar_message` (client sends avatar text)
7. `POST /v1/sessions/stop` (when user closes chat)

---

## REST Endpoints

### 1. Create Session Token

**Request:**
```
POST {baseUrl}/v1/sessions/token
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "conversation_id": "<sell_embedded_conversation_id>"
}
```

- `conversation_id` may be `null` or a string. Used for updateConversationStatus when session ends.

**Expected response:** LiveAvatar shape:
```json
{
  "data": {
    "session_id": "...",
    "session_token": "..."
  }
}
```

ilianaaiAvatar fetches avatar config (avatar_id, voice_id, context_id, intro) from Petya, then calls LiveAvatar `POST /v1/sessions/token` with `mode`, `avatar_id`, `avatar_persona`, and returns the response.

---

### 2. Start Session

**Request:**
```
POST {baseUrl}/v1/sessions/start
Accept: application/json
Content-Type: application/json
Authorization: Bearer <session_token>
```

**Body:** None (empty)

**Expected response:** LiveAvatar shape plus optional `intro`:
```json
{
  "data": {
    "session_id": "...",
    "livekit_url": "wss://...",
    "livekit_client_token": "...",
    "intro": "Hello and welcome. How can I help you today?"
  }
}
```

- `session_id`, `livekit_url`, `livekit_client_token` — required.
- `intro` — optional. If present, the plugin uses it for the initial greeting.

---

### 3. Report User Message

When `user.transcription` is received from LiveKit agent-response, the plugin sends the transcribed user text.

**Request:**
```
POST {baseUrl}/v1/streaming.user_message
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "session_id": "...",
  "text": "<transcribed user speech>"
}
```

---

### 4. Report Avatar Message (Option A)

When the avatar finishes speaking (`avatar.speak_ended`), the plugin sends the full avatar text. **Not** on every `avatar.transcription` chunk—only when speech is complete to avoid duplicates.

**Request:**
```
POST {baseUrl}/v1/streaming.avatar_message
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "session_id": "...",
  "text": "<full avatar speech text>"
}
```

---

### 5. Stop Session

**Request:**
```
POST {baseUrl}/v1/sessions/stop
Content-Type: application/json
X-Api-Key: <customer_api_key>
```

**Body:**
```json
{
  "session_id": "..."
}
```

---

## LiveKit

After `sessions/start`, the plugin connects to LiveKit using `livekit_url` and `livekit_client_token` from the response. That connection goes to LiveAvatar's LiveKit infrastructure.

### Command Events (client → LiveAvatar)

The plugin publishes to LiveKit topic `agent-control`:

| event_type | Use case | Payload |
|------------|----------|---------|
| `avatar.speak_response` | User message → avatar generates LLM response | `{"text": "<user text>"}` |
| `avatar.speak_text` | Bot speaks exact text (intro, OpenAI reply) | `{"text": "<text>"}` |

Format:
```json
{
  "event_type": "avatar.speak_response" | "avatar.speak_text",
  "session_id": "<session_id>",
  "text": "<text>"
}
```

### Server Events (LiveAvatar → client)

LiveAvatar emits to LiveKit topic `agent-response`. The plugin handles:

| event_type | Description |
|------------|-------------|
| `avatar.speak_started` | Avatar started speaking |
| `avatar.speak_ended` | Avatar finished speaking |
| `avatar.transcription` | Avatar's text (full; not streamed word-by-word) — `{"text": "..."}` |
| `user.transcription` | User's transcribed speech — `{"text": "..."}`. Plugin calls `POST /v1/streaming.user_message` on receipt. |

---

## CORS

ilianaaiAvatar must allow the plugin's origins, methods (`GET`, `POST`, `OPTIONS`), and headers (`Content-Type`, `X-Api-Key`, `Authorization`).

---

## Error Handling

Return appropriate HTTP status codes (401, 4xx, 5xx) and JSON error bodies. The plugin does not handle REST errors in detail.

---

## Migration from Heygen

| Heygen | LiveAvatar |
|--------|------------|
| `streaming.create_token` + `streaming.new` + `streaming.start` | `sessions/token` + `sessions/start` |
| WebSocket `streaming.chat` | LiveKit `agent-response` topic |
| `streaming.task` (talk/repeat) | LiveKit `agent-control` (avatar.speak_response / avatar.speak_text) |
| `streaming.stop` | `sessions/stop` |
| `url`, `access_token` | `livekit_url`, `livekit_client_token` |
