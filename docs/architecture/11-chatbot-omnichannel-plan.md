# 11 — Chatbot Omnichannel + Social Media Plan

> Đợt 6: Train once → deploy everywhere. Multi-bot, multi-channel,
> social media management.
>
> Created: 2026-04-13
> Status: Draft — awaiting approval before implementation.
> References: doc 10 (IA), walkthrough, InCard/AskMaika/WorkGPT analysis.

---

## §1 — Phát hiện kiến trúc hiện tại (verified by code-explorer)

### Chatbot hiện tại chỉ support 1 bot / 1 company

`chatbotConfig.companyId` có `.unique()` constraint → DB reject khi tạo
bot thứ 2. Conversations không có `botId` → không phân biệt được bot nào
trả lời.

### Knowledge là per-company, không per-bot

`knowledge_base` table không có `botId` hay `knowledge_set_id`. Tất cả
bots (nếu có nhiều) đều đọc cùng 1 pool knowledge. Không có cơ chế
"bot A chỉ biết FAQ, bot B biết cả FAQ + Sales Playbook".

### Visibility pipeline có BUG

Khi admin approve document → hệ thống insert vào `knowledge_base`
nhưng **KHÔNG copy `document.visibility` sang** → mọi entry mặc định
`internal`. Document được đánh dấu `public` vẫn invisible cho widget
chatbot (accessLevel=public chỉ thấy knowledge có visibility=public).

### Chatbot KHÔNG dùng vector RAG

`handleChat()` gọi `buildBusinessContext()` → SQL `ORDER BY updated_at
LIMIT 30` → dump text. Không embedding, không semantic search. Trust-
grade vector pipeline (`rag-pipeline.ts`) đã có nhưng **không wire** vào
chatbot. Kết quả: chatbot trả lời kém khi knowledge lớn (>30 entries
bị truncate).

---

## §2 — Kiến trúc mới: Train Once → Deploy Everywhere

```
┌─────────────────────────────────────────────┐
│              KNOWLEDGE HUB                   │
│  (upload PDF/URL/text, approve, tag)         │
│                                              │
│  ┌──────────────┐  ┌──────────────┐         │
│  │ Product FAQ   │  │ Internal     │  ...    │
│  │ (public)      │  │ Policies     │         │
│  │ tag: faq      │  │ (internal)   │         │
│  └──────────────┘  └──────────────┘         │
│                                              │
│  Vector RAG (semantic search, not SQL dump)  │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐
│ Bot A  │  │ Bot B   │  │ Bot C   │
│ "Web   │  │ "FB     │  │ "Zalo   │
│ Support│  │ Sales"  │  │ Care"   │
│        │  │         │  │         │
│ tags:  │  │ tags:   │  │ tags:   │
│ [faq]  │  │ [faq,   │  │ [faq,   │
│        │  │ sales]  │  │ policy] │
│ tone:  │  │ tone:   │  │ tone:   │
│ friend │  │ bold    │  │ profess │
│        │  │         │  │         │
│channels│  │channels │  │channels │
│[widget]│  │[messengr│  │[zalo_oa]│
└───┬────┘  └────┬────┘  └────┬────┘
    │            │            │
    ▼            ▼            ▼
 Website     Facebook     Zalo OA
 embed       webhook      webhook
```

### Core concept: "Knowledge Sets" via tags

Thay vì tạo bảng join phức tạp, dùng **tag-based scoping**:
- Mỗi `knowledge_base` entry có `tags: string[]` (mới)
- Mỗi `chatbotConfig` có `knowledgeTags: string[]` (mới)
- Khi build context: filter `WHERE tags && bot.knowledgeTags` (Postgres
  array overlap operator `&&`)
- Tag rỗng `[]` = bot đọc TẤT CẢ knowledge (backward-compat)
- Admin tag lúc upload/approve: "faq", "sales", "internal", "product"

### Multi-bot: remove unique constraint

- Remove `.unique()` trên `chatbotConfig.companyId`
- Add `botId` FK vào `chatConversations`
- Add `botId` param vào widget URL: `/widget/:companyId/:botId/chat`
- Backward-compat: nếu widget call cũ (không có botId) → dùng bot đầu
  tiên (default)

### Channels: separate config per platform

Mỗi bot có thể connect N channels. Bảng mới:

```sql
chatbot_channels (
  id          uuid PK,
  bot_id      uuid FK → chatbot_config.id,
  platform    varchar(30),  -- 'widget' | 'messenger' | 'zalo_oa' | 'instagram' | ...
  is_active   boolean default true,
  config      jsonb,        -- platform-specific: { pageId, accessToken, webhookSecret, ... }
  created_at  timestamp
)
```

Message routing: webhook nhận message từ platform → lookup channel →
lookup bot → call `handleChat(bot, message, channel)` → respond via
platform API.

---

## §3 — Workflow tổng thể cho CEO

### Phase A: Setup (1 lần)

```
CEO mở /knowledge → upload PDF, paste URL, type text
  → document approved → knowledge entries created (với tags)
  → visibility: public (cho widget/external) hoặc internal (chỉ team)

CEO mở /chatbot → tạo Bot A "Website Support"
  → chọn knowledge tags: [faq, product]
  → chọn tone: friendly, mode: support
  → customize: name, logo, avatar, greeting, colors
  → enable channel: Widget (auto-generate embed code)
  → copy embed code → paste vào website

CEO tạo Bot B "Facebook Sales"
  → chọn knowledge tags: [faq, product, sales]
  → tone: bold, mode: sales
  → enable channel: Facebook Messenger
  → OAuth connect → select FB Page → webhook auto-configured
```

### Phase B: Daily operation

```
Khách hàng nhắn trên website/FB/Zalo
  → Webhook nhận message
  → Route đến đúng Bot (by channel → bot mapping)
  → Bot đọc knowledge (filtered by tags + visibility)
  → Vector RAG semantic search (thay vì SQL dump)
  → LLM generate response (Brain voice + Sales Playbook aware)
  → Send response via platform API

Nếu bot không tự tin (confidence < threshold):
  → Quick reply: "Để tôi chuyển cho đội ngũ tư vấn nhé"
  → Human handoff notification → CEO/staff picks up
  → Staff chat continues (context preserved)
  → Conversation ends → CSAT survey (optional)

Khi bot detect phone number / email trong message:
  → Auto-create lead in Deals pipeline
  → Notify CEO qua CEO Advisor brief
```

### Phase C: Social media management (song song)

```
CEO mở /social (mới)
  → Schedule post cho FB/IG/LinkedIn/TikTok
  → AI draft từ Brain + campaign themes
  → Calendar view: xem tổng schedule tuần
  → Publish auto theo lịch (API call)
  → Performance metrics: reach, engagement, clicks

Comment-to-Lead:
  → FB/IG Page webhook → detect comment on ad/post
  → AI auto-reply (brand voice) + auto-DM nếu buying intent
  → Lead auto-captured → vào Deals
```

---

## §4 — Chatbot upgrades cần thiết (không cần external API)

Phần này ship TRƯỚC khi có Facebook/Zalo vì không cần API approval.

### C15: White-label chatbot

**Hiện tại:** chỉ có `name`, `greeting`, `primaryColor`.

**Cần thêm vào `chatbot_config`:**
- `logo_url` varchar(1000)
- `avatar_url` varchar(1000)
- `welcome_flow` jsonb — array of quick-reply messages shown on first open
- `powered_by_visible` boolean default true (hide "Powered by 1Person")

**UI:** Chatbot config page → new "Branding" tab với upload logo/avatar,
preview widget realtime bên phải.

### C5: Quick replies / Suggested actions

**Cần thêm:** LLM prompt instructs to return structured JSON khi có
action suggestions:

```json
{
  "text": "I'd recommend our Premium plan. Would you like to...",
  "quickReplies": [
    { "label": "See pricing", "value": "show me pricing details" },
    { "label": "Book a demo", "value": "I want to book a demo" },
    { "label": "Talk to human", "value": "connect me to your team" }
  ]
}
```

Widget renders quick reply buttons dưới mỗi bot message. Click → send
value as next visitor message → natural conversation flow.

**Schema:** `chatMessages.metadata` jsonb đã có → store `quickReplies`
trong đó. Widget đọc và render.

### C11: Auto phone detection → lead

**Hiện tại:** chỉ detect email → create lead.

**Cần thêm:** regex cho VN phone formats:
`/(0|\+84|84)(3|5|7|8|9)\d{8}/` — covers Viettel, Mobi, Vina, etc.

Khi detect → auto-create lead (tương tự email flow hiện có) + save
phone vào lead record.

### C3: Human handoff

**Flow:**
1. Bot response kèm `confidence` score (từ LLM hoặc heuristic)
2. Nếu confidence < threshold (configurable, default 0.4): bot tự
   reply "Để tôi chuyển cho đội ngũ tư vấn" + set conversation
   `status = 'waiting_handoff'`
3. CEO/staff dashboard: "Handoff queue" badge → list conversations
   đang chờ → click to pick up → chat trực tiếp (role = 'staff')
4. Staff khi chat xong → close conversation → optional CSAT survey

**Schema:**
- `chatConversations.status` thêm: `'waiting_handoff'` | `'staff_handling'`
- `chatConversations.handoffAt` timestamp
- `chatConversations.handoffStaffId` uuid FK
- Realtime: Socket.io room per company → notify khi có handoff mới

---

## §5 — Channel integrations (cần API approval)

### Facebook Messenger

**Requirement:** Facebook App + Page → Webhooks API
**Flow:**
1. Admin connects FB Page via OAuth (Graph API `pages_messaging` permission)
2. Webhook receives messages → `POST /api/v1/webhooks/messenger`
3. Lookup channel by `pageId` → find bot → call `handleChat`
4. Respond via `POST https://graph.facebook.com/v21.0/me/messages`

**Cần apply:** App Review cho `pages_messaging` permission (~1-2 tuần)

### Zalo OA

**Requirement:** Zalo Mini App / OA → Webhooks
**Flow:**
1. Admin registers Zalo OA app → paste OA ID + Secret Token vào admin config
2. Webhook nhận message → `POST /api/v1/webhooks/zalo`
3. Lookup channel → bot → `handleChat`
4. Respond via Zalo OA Send Message API

**Cần apply:** Zalo Developer Portal app approval (~1 tuần)

### Instagram DM

**Same as Messenger** — uses Instagram Graph API, same Facebook App.
Permission: `instagram_manage_messages`.

### Cài đặt comment auto-reply (C12)

**Require:** `pages_manage_metadata` + `pages_read_engagement` permissions.
Webhook subscribe to `feed` field → detect comment → AI decide: public
reply vs DM → respond via Graph API.

---

## §6 — Social Media Management (G1 từ phân tích InCard)

### Scope

**Surface mới:** `/social` (sidebar item mới hoặc tab trong Campaigns)

**Features:**
- Post scheduler: compose → preview per platform → schedule datetime → auto-publish
- AI content suggest: read Brain → campaign themes → draft post
- Calendar view: week/month overview of scheduled posts
- Analytics per post: reach, engagement, clicks (pull from platform APIs)
- Multi-platform: FB, IG, LinkedIn, TikTok (cùng Facebook App)

**Schema mới:**
```sql
social_posts_scheduled (
  id          uuid PK,
  company_id  uuid FK,
  platforms   jsonb,       -- ["facebook", "instagram", "linkedin"]
  content     text,
  media_urls  jsonb,       -- image/video URLs
  scheduled_at timestamp,
  published_at timestamp,
  status      varchar(20), -- draft | scheduled | published | failed
  platform_post_ids jsonb, -- { facebook: "123", instagram: "456" }
  metrics     jsonb,       -- { reach, engagement, clicks per platform }
  created_at  timestamp
)
```

**Reuse:** Brain + campaign themes cho AI content suggest. Existing
`campaign_social_post` featureKey cho LLM call.

---

## §7 — Bugs cần fix trước khi build

| # | Bug | Fix | Priority |
|---|---|---|---|
| B1 | Visibility pipeline: `approve` không copy `doc.visibility` sang `knowledge_base` entries | Copy visibility in approve handler (`knowledge.ts:343-358`) | 🔴 Critical — blocks public chatbot |
| B2 | Chatbot dùng SQL dump thay vì vector RAG | Wire `handleChat` to call `getTenantAI().query()` + fallback to `buildBusinessContext` | 🔴 Critical — chất lượng trả lời kém khi >30 entries |
| B3 | `chatbot_config.company_id` unique constraint blocks multi-bot | Remove `.unique()`, add `botId` FK to `conversations` | 🔴 Critical — blocks multi-bot |

---

## §8 — Implementation order (Đợt 6)

Chia 4 phase, mỗi phase ship được riêng:

### Phase 0 — Fix bugs + schema migration (main thread, 1h)
- B1: Fix visibility copy in knowledge approval
- B2: Wire vector RAG into chatbot
- B3: Remove unique, add botId, add tags, add channels table
- Push schema SQL

### Phase 1 — Chatbot upgrades (2 agents parallel, ~500 lines mỗi agent)
- **Agent I:** C15 white-label + C5 quick replies + C11 phone detect
  → chatbot config UI branding tab + widget upgrade + prompt restructure
- **Agent J:** C3 human handoff + multi-bot UI
  → handoff queue + staff chat + Socket.io notifications + bot list UI

### Phase 2 — Channel integrations (2 agents parallel, ~500 lines mỗi agent)
- **Agent K:** Facebook Messenger webhook + Zalo OA webhook
  → webhook routes + channel config UI + message normalization layer
- **Agent L:** Comment-to-lead (C12) + channel management UI
  → comment webhook + auto-reply + lead capture + channel list/connect page

### Phase 3 — Social media management (1 agent, ~500 lines)
- **Agent M:** Social post scheduler + calendar + AI draft
  → schema + routes + UI page + platform publish adapters

**Important:** Phase 2 cần Facebook App + Zalo OA approval. Bạn nên
**apply ngay hôm nay** trên:
- https://developers.facebook.com — tạo App, request `pages_messaging`
- https://developers.zalo.me — tạo App, request OA Messaging

Code sẵn sàng → khi approval xong → connect → live.

### Ước tính tổng:

| Phase | Effort | Agents | Line budget |
|---|---|---|---|
| Phase 0 (bugs + schema) | 1h | Main | ~200 |
| Phase 1 (chatbot upgrades) | 2 agents parallel | I + J | ~1000 |
| Phase 2 (channels) | 2 agents parallel | K + L | ~1000 |
| Phase 3 (social media) | 1 agent | M | ~500 |
| **Total** | ~3-4h coding | 5 agents + main | ~2700 |

---

## §9 — Knowledge-Chatbot workflow sau khi xong

```
CEO perspective (simple):

1. Upload tài liệu ở /knowledge → tag "faq" hoặc "product" hoặc "sales"
   → AI tự extract + CEO approve

2. Tạo chatbot ở /chatbot → chọn tags knowledge nào bot này biết
   → customize branding (logo, avatar, voice)

3. Connect channels:
   → Widget: copy embed code → paste vào website
   → Facebook: OAuth connect → select Page → done
   → Zalo: paste OA ID + Token → done

4. Mọi thứ auto-sync:
   → Thêm knowledge mới → tất cả bot có tag matching tự biết
   → Thay đổi Brain → tất cả bot reflect ngay
   → Mỗi conversation → auto-capture lead nếu có email/phone
```

Đây chính là "train once, deploy everywhere" mà bạn mô tả.

---

## §10 — Không build (giữ focus)

| ❌ Skip | Reason |
|---|---|
| WhatsApp Business API | Cần business verification phức tạp. Sau Phase 2 nếu có demand. |
| Telegram bot | Low priority cho VN market. 1 ngày code nếu cần sau. |
| TikTok DM | API hạn chế, chỉ có cho TikTok Shop partners. |
| LinkedIn messaging | API cực kỳ hạn chế, chỉ cho sponsored InMail. |
| Voice/audio response | Nice-to-have, high complexity. Defer. |
| E-commerce cart management | Niche. Shopify có AI riêng. |
| Community seeding (Maika Bloom) | Ethical risk, ban risk. |
