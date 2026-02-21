# Local Testing: Chatbot-Plugin ↔ ilianaaiAvatar

Use this checklist to verify the connection between the chatbot-plugin and ilianaaiAvatar before deploying to production.

---

## 1. Prerequisites

- [ ] ilianaaiAvatar is running locally (e.g. `http://localhost:3000`)
- [ ] Petya backend is running and reachable by ilianaaiAvatar (for config + updateConversationStatus)
- [ ] LiveAvatar API key is set in ilianaaiAvatar's `.env`
- [ ] WordPress with chatbot-plugin is running (e.g. `http://localhost:8080` or your local WP URL)

---

## 2. Protocol: Local vs Production (LiveAvatar)

With LiveAvatar, the plugin uses REST only for session setup; video/audio and events flow through LiveKit (not WebSocket). LiveAvatar returns `livekit_url` and `livekit_client_token` — the plugin connects directly to LiveAvatar's LiveKit infrastructure.

For ilianaaiAvatar itself (REST endpoints):
- Local: `http://localhost:3000` works for `POST /v1/sessions/token` and `/v1/sessions/start`
- If WordPress is on HTTPS and ilianaaiAvatar on HTTP, mixed content may block requests — use ngrok or local HTTPS for ilianaaiAvatar

---

## 3. WordPress Configuration

Go to **WordPress Admin → Settings → Chatbot settings**:

| Field | Value |
|-------|-------|
| **API Key** | Your SellEmbedded/customer API key (must exist in Petya for config lookup) |
| **Avatar Service URL** | `http://localhost:3000` (local) or `https://...` (production) |

**No trailing slash.** Example: `http://localhost:3000` for local ilianaaiAvatar.

---

## 4. ilianaaiAvatar Checklist (LiveAvatar)

- [ ] **Routes:** `POST /v1/sessions/token`, `POST /v1/sessions/start`, `POST /v1/sessions/stop`, `POST /v1/streaming.avatar_message`
- [ ] **CORS:** Allows your WordPress origin (e.g. `http://localhost:8080`) — or `*` for dev
- [ ] **Headers:** Accepts `X-Api-Key` and `Authorization: Bearer <session_token>`
- [ ] **Petya config:** Returns valid `avatarId`, `intro`, `voiceId`, `contextId` for your API key

---

## 5. Manual Request Tests

Before testing in the UI, verify each endpoint manually.

### 5.1 Create Session Token

```bash
curl -X POST "YOUR_AVATAR_URL/v1/sessions/token" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"conversation_id":null}'
```

**Expected:** `{"data":{"session_id":"...","session_token":"..."}}`

### 5.2 Start Session

```bash
curl -X POST "YOUR_AVATAR_URL/v1/sessions/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

**Expected:** `{"data":{"session_id":"...","livekit_url":"wss://...","livekit_client_token":"...","intro":"..."}}`

If any request fails, fix ilianaaiAvatar before testing the full flow.

---

## 6. Browser Testing Flow

1. Open the WordPress site with the chatbot.
2. Open DevTools → **Network** tab.
3. Click the chat **Start** button.
4. Watch the network requests:

| Order | Request | Expected |
|-------|---------|----------|
| 1 | `POST .../v1/sessions/token` | 200, JSON with `data.session_id`, `data.session_token` |
| 2 | `POST .../v1/sessions/start` | 200, JSON with `data.livekit_url`, `data.livekit_client_token` |
| 3 | LiveKit WebSocket (to LiveAvatar) | 101 — video/audio stream and agent-response events |

5. If any request is **blocked by CORS**, check ilianaaiAvatar CORS config.
6. If **Mixed Content** blocks requests (WordPress HTTPS + ilianaaiAvatar HTTP), use ngrok or local HTTPS for ilianaaiAvatar.

---

## 7. Common Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| CORS error in console | ilianaaiAvatar not allowing your origin | Add your origin to CORS or use `*` for dev |
| `Failed to fetch` / network error | Wrong URL, or ilianaaiAvatar not running | Check Avatar Service URL; ensure ilianaaiAvatar is up |
| 401 on requests | Invalid or missing API key | Ensure API key in WordPress matches Petya; check `X-Api-Key` header |
| `data.session_token` / `livekit_client_token` undefined | ilianaaiAvatar response shape differs from contract | Match LiveAvatar response format; see CHATBOT-PLUGIN-API-CONTRACT.md |
| LiveKit connection fails | Invalid token or LiveAvatar down | Check `livekit_url` and `livekit_client_token` from sessions/start |

---

## 8. Mixed Content (WordPress HTTPS + Local HTTP)

If WordPress runs on HTTPS (e.g. `https://mysite.local`) and ilianaaiAvatar is `http://localhost:3000`, the browser may block requests (mixed content). In that case use ngrok or a local HTTPS setup for ilianaaiAvatar.
