# Local Testing: Chatbot-Plugin ↔ ilianaaiAvatar

Use this checklist to verify the connection between the chatbot-plugin and ilianaaiAvatar before deploying to production.

---

## 1. Prerequisites

- [ ] ilianaaiAvatar is running locally (e.g. `http://localhost:3000`)
- [ ] Petya backend is running and reachable by ilianaaiAvatar (for config + updateConversationStatus)
- [ ] Heygen API key is set in ilianaaiAvatar's `.env`
- [ ] WordPress with chatbot-plugin is running (e.g. `http://localhost:8080` or your local WP URL)

---

## 2. WebSocket Protocol: Local vs Production

The chatbot-plugin constructs the WebSocket URL as:

```
wss://{hostname}/v1/ws/streaming.chat?...
```

**Issue:** For local testing without SSL, ilianaaiAvatar likely uses `http://localhost:3000`. The plugin always uses `wss://`, which will fail against a non-SSL server.

**Options:**

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **A** | Use `https://` and `wss://` locally | Run ilianaaiAvatar with a local HTTPS certificate (e.g. `mkcert`) | Closest to production |
| **B** | Use ngrok/localtunnel | Expose local ilianaaiAvatar via `https://xxx.ngrok.io` | No code changes; get real HTTPS URL |
| **C** | Update plugin for local dev | Use `ws://` when `avatarServiceUrl` starts with `http://` | Works with plain `http://localhost` |

**Recommendation:** The chatbot-plugin now supports `ws://` when `avatarServiceUrl` uses `http://`. You can test locally with `http://localhost:3000` (or your ilianaaiAvatar port) — no ngrok required. For production, use `https://` and `wss://`.

---

## 3. WordPress Configuration

Go to **WordPress Admin → Settings → Chatbot settings**:

| Field | Value |
|-------|-------|
| **API Key** | Your SellEmbedded/customer API key (must exist in Petya for config lookup) |
| **Avatar Service URL** | `http://localhost:3000` (local) or `https://...` (production) |

**No trailing slash.** Example: `http://localhost:3000` for local ilianaaiAvatar.

---

## 4. ilianaaiAvatar Checklist

- [ ] **Routes:** Endpoints available at `/v1/streaming.create_token`, `/v1/streaming.new`, etc. (no `/api/v1/avatar` prefix if chatbot uses base as `avatarServiceUrl`)
- [ ] **CORS:** Allows your WordPress origin (e.g. `http://localhost:8080`) — or `*` for dev
- [ ] **Headers:** Accepts `X-Api-Key` and `X-api-key` (both used by the plugin)
- [ ] **Petya config:** `GET /api/v1/avatar/config` returns valid config for your API key
- [ ] **WebSocket:** Serves WebSocket at `wss://{host}/v1/ws/streaming.chat`

---

## 5. Manual Request Tests

Before testing in the UI, verify each endpoint manually (Postman, curl, or browser console).

### 5.1 Create Token

```bash
curl -X POST "https://YOUR_AVATAR_URL/v1/streaming.create_token" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY"
```

**Expected:** `{"data":{"token":"..."}}`

### 5.2 Create Session (streaming.new)

```bash
curl -X POST "https://YOUR_AVATAR_URL/v1/streaming.new" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"quality":"medium","version":"v2","conversation_id":null}'
```

**Expected:** `{"data":{"session_id":"...","url":"...","access_token":"...","intro":"..."}}`

If any request fails, fix ilianaaiAvatar before testing the full flow.

---

## 6. Browser Testing Flow

1. Open the WordPress site with the chatbot.
2. Open DevTools → **Network** tab.
3. Click the chat **Start** button.
4. Watch the network requests:

| Order | Request | Expected |
|-------|---------|----------|
| 1 | `POST .../v1/streaming.create_token` | 200, JSON with `data.token` |
| 2 | `POST .../v1/streaming.new` | 200, JSON with `data.session_id`, `data.url`, `data.access_token` |
| 3 | `wss://.../v1/ws/streaming.chat` | 101 (WebSocket upgrade) |
| 4 | `POST .../v1/streaming.start` | 200 |
| 5 | WebSocket frames | avatar_talking_message, etc. |

5. If any request is **blocked by CORS**, check ilianaaiAvatar CORS config.
6. If WebSocket fails with **Mixed Content** (WordPress on HTTPS, avatar on HTTP), use the same protocol for both, or use ngrok for local HTTPS.

---

## 7. Common Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| CORS error in console | ilianaaiAvatar not allowing your origin | Add your origin to CORS or use `*` for dev |
| `Failed to fetch` / network error | Wrong URL, or ilianaaiAvatar not running | Check Avatar Service URL; ensure ilianaaiAvatar is up |
| WebSocket closes immediately | Wrong protocol or ilianaaiAvatar WebSocket not ready | Plugin uses ws/wss based on avatarServiceUrl; ensure ilianaaiAvatar serves WebSocket |
| 401 on requests | Invalid or missing API key | Ensure API key in WordPress matches Petya; check `X-Api-Key` header |
| `data.token` / `data.session_id` undefined | ilianaaiAvatar response shape differs from Heygen | Match Heygen response format; see CHATBOT-PLUGIN-API-CONTRACT.md |

---

## 8. Mixed Content (WordPress HTTPS + Local HTTP)

If WordPress runs on HTTPS (e.g. `https://mysite.local`) and ilianaaiAvatar is `http://localhost:3000`, the browser may block requests (mixed content). In that case use ngrok or a local HTTPS setup for ilianaaiAvatar.
