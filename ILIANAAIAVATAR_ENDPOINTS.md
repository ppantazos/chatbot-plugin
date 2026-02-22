# ilianaaiAvatar API Endpoints

This document specifies all endpoints for the **ilianaaiAvatar** proxy app, which proxies LiveAvatar API calls. The proxy keeps the LiveAvatar API key server-side and exposes a client-friendly API for the chatbot-plugin.

## Overview

| Heygen (legacy) | LiveAvatar | ilianaaiAvatar Proxy |
|-----------------|------------|----------------------|
| `POST /v1/streaming.create_token` | `POST /v1/sessions/token` | `POST /api/sessions/token` |
| `POST /v1/streaming.new` | (merged into token) | (included in token payload) |
| `POST /v1/streaming.start` | `POST /v1/sessions/start` | `POST /api/sessions/start` |
| `POST /v1/streaming.task` | Command events (WebSocket/LiveKit) | `POST /api/sessions/speak` |
| `POST /v1/streaming.stop` | `POST /v1/sessions/stop` | `POST /api/sessions/stop` |
| - | `POST /v1/sessions/keep-alive` | `POST /api/sessions/keep-alive` |
| `wss://.../v1/ws/streaming.chat` | LiveAvatar session WebSocket | Proxied via `ws_url` from start response |

**Terminology mapping:**
- `knowledge_base_id` (Heygen) → `context_id` (LiveAvatar, in `avatar_persona`)
- `task_type: "talk"` → `avatar.speak_response` command
- `task_type: "repeat"` → `avatar.speak_text` command

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEAVATAR_API_KEY` | Yes | LiveAvatar API key (never exposed to client) |
| `LIVEAVATAR_AVATAR_ID` | Yes* | LiveAvatar avatar UUID. Get one from `GET /api/avatars/public`. When set, the proxy uses this and ignores client `avatar_id`. *Required if chatbot does not send a valid UUID. |
| `PORT` | No | Server port (default: 3000) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*` for dev) |

---

## Authentication

**Client → ilianaaiAvatar:** Sessions and avatars endpoints do not require auth from the client.

**ilianaaiAvatar → LiveAvatar:** All requests to LiveAvatar use `X-API-KEY: <LIVEAVATAR_API_KEY>` header. For session start/stop with session token, use `Authorization: Bearer <session_token>`.

---

## REST Endpoints

### 1. Create Session Token

**Endpoint:** `POST /api/sessions/token`

**Description:** Creates a LiveAvatar session token. Replaces Heygen's `streaming.create_token` + `streaming.new`.

**Request headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "avatar_id": "uuid-string",
  "context_id": "uuid-string|null",
  "voice_id": "uuid-string|null",
  "language": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| avatar_id | string (UUID) | No* | LiveAvatar avatar ID. When `LIVEAVATAR_AVATAR_ID` is set in proxy `.env`, it takes precedence over this. *Required in request or env. |
| context_id | string (UUID) \| null | No | Context/knowledge base ID (maps from knowledgeBaseId) |
| voice_id | string (UUID) \| null | No | Voice ID for TTS |
| language | string | No | Language code (default: "en") |

**Response (200):**
```json
{
  "session_id": "uuid",
  "session_token": "jwt-string"
}
```

**Proxy implementation:** Forward to LiveAvatar `POST https://api.liveavatar.com/v1/sessions/token` with:
```json
{
  "mode": "FULL",
  "avatar_id": "<avatar_id>",
  "avatar_persona": {
    "context_id": "<context_id>",
    "voice_id": "<voice_id>",
    "language": "<language>"
  }
}
```
Headers: `X-API-KEY`, `Content-Type: application/json`, `Accept: application/json`

---

### 2. Start Session

**Endpoint:** `POST /api/sessions/start`

**Description:** Starts the LiveAvatar session and returns LiveKit connection details.

**Request headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
Accept: application/json
```

**Request body:** Empty or `{}`

**Response (201):**
```json
{
  "session_id": "uuid",
  "livekit_url": "wss://...",
  "livekit_client_token": "jwt-string",
  "ws_url": "wss://...|null"
}
```

| Field | Description |
|-------|-------------|
| livekit_url | LiveKit WebRTC URL for avatar video/audio |
| livekit_client_token | Token to connect client to LiveKit room |
| ws_url | WebSocket URL for command events (CUSTOM mode only; null for FULL) |

**Proxy implementation:** Forward to LiveAvatar `POST https://api.liveavatar.com/v1/sessions/start` with `Authorization: Bearer <session_token>`.

---

### 3. Send Text (Speak)

**Endpoint:** `POST /api/sessions/speak`

**Description:** Sends text to the avatar for TTS. Replaces Heygen `streaming.task` with task_type "talk" or "repeat".

**Request headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "text": "Hello, how can I help?",
  "task_type": "repeat"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | Yes | Text for the avatar to speak |
| task_type | string | No | "talk" (avatar.speak_response) or "repeat" (avatar.speak_text). Default: "repeat" |

**Response (200):**
```json
{
  "success": true
}
```

**Proxy implementation (optional):** For FULL mode, LiveAvatar does not expose a REST speak endpoint or ws_url. The chatbot-plugin sends speak commands via **LiveKit Room.publishData()** after connecting. The proxy may implement this endpoint for CUSTOM mode when ws_url is available—the proxy would forward to LiveAvatar's WebSocket. For FULL mode, this endpoint returns `501 Not Implemented`; clients must use LiveKit publishData.

**Client integration:** In FULL mode, avatar.js uses `room.publishData()` with:
- Topic: `avatar.speak_text` (for repeat) or `avatar.speak_response` (for talk)
- Payload: `JSON.stringify({ text: "..." })`

---

### 4. Stop Session

**Endpoint:** `POST /api/sessions/stop`

**Description:** Stops the LiveAvatar session.

**Request headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request body (optional):**
```json
{
  "session_id": "uuid|null",
  "reason": "USER_CLOSED"
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Proxy implementation:** Forward to LiveAvatar `POST https://api.liveavatar.com/v1/sessions/stop` with `Authorization: Bearer <session_token>`.

---

### 5. Keep Session Alive

**Endpoint:** `POST /api/sessions/keep-alive`

**Description:** Extends the session idle timeout. Call periodically to prevent automatic closure.

**Request headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request body (optional):**
```json
{
  "session_id": "uuid|null"
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Proxy implementation:** Forward to LiveAvatar `POST https://api.liveavatar.com/v1/sessions/keep-alive` with `Authorization: Bearer <session_token>` or `X-API-KEY` if using API key.

---

### 6. List Public Avatars

**Endpoint:** `GET /api/avatars/public`

**Description:** Lists available public avatars (optional; for avatar selection UI).

**Query parameters:**
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Results per page (default: 20, max: 100)

**Response (200):**
```json
{
  "data": {
    "count": 10,
    "results": [
      {
        "id": "uuid",
        "name": "Avatar Name",
        "preview_url": "https://...",
        "default_voice": { "id": "uuid", "name": "Voice Name" }
      }
    ]
  }
}
```

**Proxy implementation:** Forward to LiveAvatar `GET https://api.liveavatar.com/v1/avatars/public` with `X-API-KEY`.

---

## WebSocket Events (LiveAvatar → Client)

When using LiveKit in FULL mode, session events (avatar speech, state updates) may be delivered via LiveKit Data channel or via a separate WebSocket. The client should subscribe to:

| LiveAvatar event | Heygen-compatible mapping | Description |
|------------------|---------------------------|-------------|
| `agent.speak_started` | `avatar_start_talking` | Avatar began speaking |
| `agent.speak_ended` | `avatar_stop_talking` | Avatar finished speaking |
| (streaming text) | `avatar_talking_message` | Partial text as avatar speaks |
| (streaming complete) | `avatar_end_message` | Final text when avatar stops |

Map these in the client's `onDataReceived` handler for compatibility with the existing main.js logic.

---

## Example cURL Commands

```bash
# 1. Create session token
curl -X POST https://your-ilianaaiAvatar-host/api/sessions/token \
  -H "Content-Type: application/json" \
  -d '{"avatar_id":"<uuid>","context_id":"<uuid>","voice_id":"<uuid>","language":"en"}'

# 2. Start session (use session_token from step 1)
curl -X POST https://your-ilianaaiAvatar-host/api/sessions/start \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json"

# 3. Keep session alive
curl -X POST https://your-ilianaaiAvatar-host/api/sessions/keep-alive \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json"

# 4. Stop session
curl -X POST https://your-ilianaaiAvatar-host/api/sessions/stop \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json"

# 5. List public avatars
curl -X GET "https://your-ilianaaiAvatar-host/api/avatars/public?page=1&page_size=20"
```

---

## Verification Checklist (Web and Mobile)

After deploying ilianaaiAvatar and updating the chatbot-plugin:

1. **Proxy connectivity**
   - Ensure ilianaaiAvatar is running with `LIVEAVATAR_API_KEY` set
   - Chatbot-plugin WordPress settings: set "Avatar Proxy URL" to ilianaaiAvatar base URL (e.g. `http://localhost:3000` or production URL)

2. **Web**
   - Click "Let's talk" → chatbox opens, session starts
   - Avatar video appears in the video area
   - Speak or type a message → avatar responds with audio and streaming text
   - Mute/unmute works; close button ends the session

3. **Mobile (iOS Safari, Android Chrome)**
   - Same flow as web
   - Microphone permission requested on first "Let's talk" tap (user gesture)
   - Avatar audio plays (ensure `playsinline` and `mediaElement.play()` after `srcObject` are used)
   - AudioContext resumes on first user interaction (tap, touch)
   - Cache busting avoids stale script on mobile

4. **Avatar ID format**
   - LiveAvatar uses UUID for `avatar_id` (e.g. from `GET /api/avatars/public`)
   - Heygen used string IDs like `Katya_Chair_Sitting_public`
   - Configure a valid LiveAvatar avatar UUID via SellEmbedded account config (`avatarId`)
</think>
Checking how LiveAvatar command events are sent in FULL mode:
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
WebSearch