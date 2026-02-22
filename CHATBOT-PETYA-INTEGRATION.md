# Instructions for Chatbot Team – Petya Integration

## 1. Petya integration overview

- The chatbot calls Petya **directly** at `https://app.sellembedded.com/api/v1`.
- All Petya calls (config, visitors, conversations, messages) go from the plugin to Petya.
- **No message proxy via ilianaaiAvatar.**

---

## 2. What the plugin does

- **API key:** Uses the Petya API key from plugin settings.
- **sendMessage:** Posts to `POST https://app.sellembedded.com/api/v1/messages/userMessages/init` with:
  - `Authorization: Bearer <api-key>`
  - Body: `{ conversationId, isFromUser, content }`

---

## 3. Requirements

- Petya API key in plugin settings.
- **Petya API Base URL** in plugin settings:
  - **Production** (default): `https://app.sellembedded.com/api/v1` – messages go to production MongoDB.
  - **Local**: `http://localhost:5000/api/v1` – messages go to local MongoDB (run Petya with `npm run dev`).
- CORS configured for the chatbot origin.
- API key must match a Petya account (e.g. `SE_5799564546777614`).

---

## 4. Flow

1. **initUserConversation** → conversation created, `conversationId` stored.
2. **Each message** → `sendMessage` to `/messages/userMessages/init` with that `conversationId`.
3. **On chat close** → `completeUserConversation`.

---

## Petya endpoints called by the plugin

| Purpose           | Endpoint                                       |
|-------------------|------------------------------------------------|
| Get account config| `GET /account/config`                          |
| Init visitor      | `POST /visitors/init`                          |
| Init conversation | `POST /conversations/userConversation/init`    |
| Store message     | `POST /messages/userMessages/init`             |
| Complete conversation | `PATCH /conversations/userConversation/:id/status` |

All requests use `Authorization: Bearer <api-key>` and `Content-Type: application/json`.

---

## ilianaaiAvatar

ilianaaiAvatar is used **only for LiveAvatar** (avatar sessions, tokens, LiveKit). It does **not** handle Petya. The chatbot talks to Petya directly.
