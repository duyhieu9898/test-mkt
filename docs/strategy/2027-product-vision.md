# 1Person AI — 2027 Product Vision

> Version: 1.0 — 2026-05-16
> Status: Active north star
> Origin: Deep research synthesis (2 parallel research agents, May 2026)

---

## TL;DR Verdict (May 2026)

1Person đang ở **vị trí đáng ngạc nhiên là tốt hơn 70% thị trường** ở mảng *agent orchestration* và *end-to-end automation pipeline* (keyword → blog → banner → social → landing page → leads → email). Đây là thứ HubSpot mất 5 năm chưa làm xong, Sintra/10Web mới làm 1 phần.

Nhưng đang **thiếu hẳn cuộc chơi 2026-2027**:
- GEO/LLMO (86.83% search có AI Overview)
- Agent evolution loop (không ai có → moat opportunity)
- Brand IQ layer
- Outcome-based billing
- Real-time semantic content grading
- "AI employees with personalities" UX

**Cửa sổ cơ hội** còn mở khoảng **9-12 tháng**. Đủ để build và chiếm category nếu ship đủ nhanh.

---

## The 5-Second Demo (North Star)

Founder paste domain + 1 câu vision → trong **5 phút**:

1. CEO Agent assemble team (CMO, Head of SEO/GEO, Content, Sales, Support, Designer, Video)
2. Brand IQ profile tự generate (voice, audience, knowledge base, style guide, visual)
3. 90-day plan với KPIs cụ thể
4. Content/SEO/GEO agents bắt đầu publish với daily approval cards
5. GEO tracker baseline → biết AI Share of Voice ngày 1

> Không competitor nào làm được điều này hôm nay. **Đây là viral moment.**

---

## 12 Trụ cột bắt buộc cho "2027-grade"

| # | Trụ cột | Vì sao | 1Person hiện trạng | Block |
|---|---|---|---|---|
| 1 | **GEO/LLMO tracking** (ChatGPT, Gemini, Perplexity, AI Overviews, AI Mode) | Table stakes. Mọi tool top đều có. | ❌ | 1 |
| 2 | **AI Share of Voice metric** + competitor benchmark | 1 số duy nhất founder hiểu. | ❌ | 1 |
| 3 | **Brand IQ Layer** (auto từ URL+samples → voice/audience/KB/style/visual) | Jasper IQ là killer. Mọi agent reference. | Có brand kit cơ bản | 2 |
| 4 | **Real-time semantic content grader** (dual NLP, live SERP) | Surfer/Clearscope core. | ❌ | 4 |
| 5 | **Agent-native event graph** (Attio-style, audit cards) | Tránh trap "agent bolted onto 2010 CRM". | Schema có, chưa event-graph | 7 |
| 6 | **AI employees with personalities** (named, KPI dashboard, weekly check-in) | Sintra UX. Non-tech founder cần "người". | Roles có, generic naming | 3 |
| 7 | **Vector RAG memory** mỗi agent | CrewAI, mọi multi-agent framework đều có. | ❌ memory chỉ là text | 3 |
| 8 | **Agent evolution loop** (prompt/skill cải thiện theo outcome) | **KHÔNG CÓ COMPETITOR NÀO SHIP** → moat. | Skeleton có, chưa chạy | 5 |
| 9 | **Cross-channel chat** (web + FB + Zalo + IG + WhatsApp + SMS + voice) | HubSpot 9 channels, 65% resolution. | Chỉ web widget | 6 |
| 10 | **Programmatic SEO với editorial gates** | Ryze/Harbor đang ăn category. | ❌ | 9 |
| 11 | **Multimodal native** (video, image, banner) trong cùng pipeline SEO | **Mọi competitor yếu chỗ này** → wedge. | Skeleton có | 8 |
| 12 | **Outcome-based billing** ($X/article, $Y/lead, $Z/ticket) | HubSpot dẫn đầu 4/2026. | Credit system có | 7 |

---

## 5 Moat Zones (nơi không competitor nào lấp được trong 12 tháng)

### 1. Agent Evolution Loop
- Jasper, HubSpot, Surfer đều stateless.
- 1Person đã có `feedback-loop.ts` skeleton.
- Active prompt optimization + per-company fine-tuning trong 6-8 tuần → moat lâu dài.

### 2. Solo Non-Technical Founder Persona
- HubSpot/Salesforce/Jasper giả định có team.
- Sintra gần nhất nhưng credits cạn nhanh, không auto-publish.
- 1Person đã có Growth Score + Daily Missions + Streaks — **unique**.
- Push mạnh gamification + non-tech UI.

### 3. Vietnamese + Emerging Market First
- Zalo / FB Messenger VN / TikTok VN / bilingual brand voice.
- Toàn bộ competitor Anglo-centric.
- "Đợt 6" trong roadmap memory đúng hướng.

### 4. Multimodal-Integrated SEO
- Banner + video + image tự sinh từ SEO content trong cùng pipeline.
- Mọi competitor text-first.
- 1Person đã có image-generator multi-provider + video-engine skeleton — chỉ cần đóng pipeline.

### 5. "Company in a Box" 5-Second Demo
- Paste URL → 5 phút có team chạy.
- Không ai làm được hôm nay.
- Viral moment + category-defining positioning.

---

## What to NOT Build (kỷ luật focus)

| Skip | Lý do | Workaround |
|---|---|---|
| Backlink monitoring đầy đủ | Ahrefs/Semrush mất 10 năm xây index | Partner / API integration nếu user request |
| Technical SEO audit toàn diện | Tốn build effort | Partner Lighthouse API |
| Mobile native app | Chưa cần | Web PWA |
| White-label | Distract khỏi core | Chỉ làm khi có agency request thật |
| Salesforce-grade enterprise CRM | Sai persona | Không target enterprise |
| Full social analytics | Tốn build | Deep link platform native dashboards |
| Plagiarism detection | Brand IQ + voice match đã đủ | — |

---

## Bets có thể fail (honest)

| Bet | Rủi ro | Mitigation |
|---|---|---|
| GEO tracking từ self-poll LLM APIs | LLM provider chặn / cost nổ | Cache 24h, prompt sampling thay vì exhaustive |
| Agent evolution loop | Evaluation noisy, A/B mất nhiều tuần data | Start với 3-5 high-volume agents (content, social) |
| Outcome-based pricing | Khó measure "indexed", "qualified" objectively | Bắt đầu metric đơn giản (published + GSC indexed = 1 outcome) |
| Programmatic SEO | Google deindex / AI Overview penalty | Editorial gate phải mạnh, cap tốc độ, human review ≥20% |
| Zalo/WhatsApp API approval | 2-3 tháng | Submit ngày 1, FB Messenger ship trước |

---

## Cross-cutting Technical Priorities

Phải làm song song với mọi block:

- **Vector DB**: bật pgvector trong PostgreSQL hiện tại (không cần Qdrant riêng cho v1)
- **WebSocket realtime**: replace polling cho dashboard, inbox, chat
- **Event bus**: Redis Streams cho mọi agent action → feed evolution loop + audit cards + analytics
- **Observability**: OpenTelemetry traces cho mỗi agent execution (đã planned trong CLAUDE.md)
- **Rate limiting**: extend cho tất cả endpoints

---

## Liên kết

- Full landscape data: [competitive-research-2026.md](./competitive-research-2026.md)
- Current state snapshot: [current-feature-inventory.md](./current-feature-inventory.md)
- Tactical execution plan: [build-now-plan.md](./build-now-plan.md)
