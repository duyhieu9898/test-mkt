# CEO Onboarding Walkthrough

> Hướng dẫn step-by-step cho một CEO non-tech lần đầu vào hệ thống 1Person.
> Thiết kế cho người bận rộn — mỗi bước: xem → AI đề xuất → approve → click.
>
> Ngày tạo: 2026-04-12
> Đối chiếu: docs/architecture/10-venture-ceo-ia.md (IA), doc 08 P0-C2 (onboarding rework)

---

## §0 — Nguyên tắc thiết kế (không thể đàm phán)

Mọi interaction phải tuân 5 nguyên tắc sau — nếu vi phạm, quay lại thiết kế:

1. **Không có instruction "đi đâu, click gì"** dài dòng. Hệ thống **dẫn** bằng nút primary lớn ở đúng nơi CEO đang nhìn.
2. **AI làm trước, CEO review sau.** Mỗi màn: CEO thấy cái gì đó ĐÃ có (draft, bản phân tích, gợi ý) — chỉ cần approve/edit/reject. Không có form trắng xin data.
3. **Mọi hành động đều ở dashboard.** Không email, không bắt cài app, không yêu cầu setup OAuth trừ khi bắt buộc.
4. **Credits hiển thị trước khi tiêu.** CEO luôn biết "hành động này tốn N credits" trước khi click.
5. **Mỗi step có "exit" rõ ràng.** CEO có thể skip bất kỳ step nào và quay lại sau. Không có dead-end "phải điền mới đi tiếp".

---

## §1 — Flow đầy đủ (CEO lần đầu → campaign đầu tiên live trong ~15 phút)

### Step 1 · Register (30s)

**CEO thấy:** `/register` — 3 field (Họ tên, Email, Password) + nút "Create account".

**CEO click:** Create account.

**Hệ thống làm:** tạo user, lưu state `pendingApproval=true`, hiển thị banner "Tài khoản của bạn đang chờ admin duyệt. Chúng tôi sẽ gửi email khi sẵn sàng" — tạm thời CEO ở màn hình chờ.

> **Non-tech friendly check:** ❌ hiện tại có pendingApproval manual. **Cần fix:** bỏ admin approval cho test-drive mode, hoặc auto-approve nếu email whitelist. *[Gap → Đợt 4]*

### Step 2 · Đăng nhập lần đầu → FTUX wizard (2–3 phút)

**CEO thấy:** màn FTUX chiếm full-screen, chia 3 bước ngang (wizard):
1. "Bạn kinh doanh gì?"
2. "Dán URL website của bạn"
3. "Xem AI của bạn hiểu gì về công ty bạn"

**CEO làm ở bước 1:** chọn 1 trong ~6 preset industry (SaaS, E-commerce, Dịch vụ, F&B, Giáo dục, Khác) hoặc type tự do 1 dòng.

**CEO làm ở bước 2:** paste URL website (optional — có skip). Nếu chưa có website → preset từ industry.

**Hệ thống làm (background, 5–10s):**
- Crawl website qua Jina Reader (free, không cần key)
- Gọi `brain-autoextract` → AI extract brand voice + persona + products (Task 11.5 đã có)
- Tạo company + tenant + seed Brain rows

**CEO thấy ở bước 3 — "Meet your Brain":** màn hình đẹp hiển thị:
- Avatar / logo (lấy từ website) + tên công ty
- "AI đã học được về bạn:"
  - Brand voice: **Friendly & educational** (example snippets)
  - Khách hàng chính: **Parents of children 5-12, HCMC, busy professionals** (description)
  - 3 sản phẩm chính: tên + 1 dòng mỗi cái
- 2 nút:
  - "Chỉnh sửa Brain" (ghost) → /brain
  - **"Bắt đầu →"** (primary, lớn) → dashboard

> **Wire end-to-end:** ✅ FTUX crawl + autoextract đã có (Task 11.6). Cần kiểm tra FTUX UI có render đúng preview không. *[Verify in Đợt 4]*

### Step 3 · Landing ở Dashboard

**CEO thấy:** `/{companyId}` dashboard với layout:
- Header: "Chào [Name], đây là gì AI của bạn khuyên hôm nay"
- **Card lớn chính giữa — "Hành động quan trọng nhất hôm nay"** — CTA primary → CEO Advisor
- Dưới là 4 card nhỏ (Campaigns / Sales / Market / Knowledge) với counter (0 campaigns, 0 deals, ...) — mỗi card là CTA chuyển sang surface đó

**CEO click:** card chính giữa hoặc "CEO Advisor" trên sidebar.

> **Wire check:** ❌ dashboard hiện tại (`/{companyId}/page.tsx`) chưa có empty state dành cho CEO mới. Nó hiển thị KPIs kỹ thuật. **Cần rewrite** trong Đợt 4. *[Gap]*

### Step 4 · CEO Advisor → Refresh lần đầu

**CEO thấy:** `/insights` (CEO Advisor) với empty state:
- Icon Sparkles lớn
- Text: "AI của bạn chưa đưa ra gợi ý nào. Click Refresh để nhận brief đầu tiên."
- Button primary: **"Refresh advice (10 credits)"**

**CEO click:** Refresh.

**Hệ thống làm (5-10s):**
- Aggregate data (nghèo vì mới onboard): 0 campaigns, 0 deals, 0 market signals, brain vừa extract từ FTUX
- LLM call Chief of Staff prompt
- Trả về brief với actions như:
  - "Tạo chiến dịch đầu tiên để test market phản hồi" → /campaigns
  - "Thêm 2-3 đối thủ để AI theo dõi" → /market
  - "Bổ sung Sales Playbook để AI giúp chốt deal" → /brain

**CEO thấy:** brief được render — 3 card action, mỗi card có nút "Go →" chuyển đúng sang surface đó.

> **Wire check:** Agent C (Đợt 3) đang build cái này. End-to-end = /insights UI → POST refresh → services/ceo-advisor.ts → Chief of Staff LLM call → save to ceo_advisor_briefs → return → render.

### Step 5 · Action đầu tiên — Tạo Campaign (5 phút)

**CEO click:** "Go →" ở action "Tạo chiến dịch đầu tiên" trong CEO Advisor brief.

**CEO thấy:** `/campaigns` với BrainReadinessBanner trên đầu (đã có ở Đợt 1):
- "Your AI is ready ✓" với brand voice + persona + product count
- Dưới là nút "Generate Campaign" (big primary)

**CEO click:** Generate Campaign.

**CEO thấy:** dialog:
- "Mục tiêu?" (text input, AI gợi ý 3 preset)
- "Khách hàng?" (textarea, pre-filled từ Brain persona)
- "Chất lượng?" (3 card: Fast 2 credits / Balanced 6 credits / Premium 20 credits)

**CEO click:** Generate.

**Hệ thống làm (10-30s):**
- Backend creates campaign row
- Kicks off generation pipeline
- SSE stream: "Đang đọc Brain..." → "Đang viết ad copy..." → "Đang tạo banner..." → "Xong"

**CEO thấy campaign detail page `/campaigns/:id`:**
- Status badge "Ready"
- 3-5 banner variants side-by-side. Click 1 để preview lớn.
- Mỗi banner có 4 nút: Preview / Edit / Download / **Why?** / Use
- 2-4 social post variants (FB, LinkedIn, X)
- Big nút primary "Launch campaign"

**CEO review bằng cách click Why? trên banner:** dialog hiển thị "AI dùng Brain voice = friendly, persona = Busy parents, 3 products = X,Y,Z" + link "Open full trace".

**CEO click:** "Use" (approve banner) → "Launch" → campaign chuyển sang live.

> **Wire check:** ✅ toàn bộ flow đã có (Đợt 1 + 2). Verify: Why button mở lineage đúng, tier picker trong Generate Campaign dialog hiển thị credit cost từ DB.

### Step 5.5 · Tạo landing page làm destination cho campaign (5 phút)

Campaign có banner, post, ads — nhưng cần **1 trang đích**. Đây là nơi traffic đổ về.

**CEO click:** Tab "Landing Pages" ngay trên đầu `/campaigns` (cùng 1 surface nhờ `MarketingTabs`).

**CEO thấy:** `/landing-pages` với list hiện có + nút "New landing page".

**CEO click:** New landing page → wizard (`PageGeneratorWizard` có sẵn) hỏi:
- Tên trang
- Mục đích (1 dòng)
- Audience
- Key features

**Hệ thống làm (15-30s):** AI generate toàn bộ block (hero, problem, solution, features, pricing, testimonials, faq, cta, footer) dùng Brain + business context.

**CEO thấy:** detail page của landing với preview + inline editor. Click vào text bất kỳ → edit trực tiếp. Thay ảnh qua picker.

**CEO click:** Publish → dialog mới (Đợt 5):
- Subdomain (validate unique, suggest từ tên company)
- Meta title, description, keywords
- Preview bên phải hiển thị đúng như trang thật
- Nút "Submit for publish approval"

**Hệ thống làm:** lưu `publishApprovalStatus = 'pending_approval'` + `publishSubmittedAt = now`. Admin của 1Person sẽ thấy trong `/admin/publish-queue`.

**Admin làm:** mở queue → preview → Approve (hoặc Reject với reason nếu subdomain trùng, content vi phạm, v.v.)

**Kết quả:** trang live tại `app.1person.ai/pages/:subdomain`. CEO thấy "Live" badge + link public, có thể share cho traffic campaign đổ về.

> **Wire check:** Đợt 5 Agent G đang build — publish dialog rewrite + admin queue + public render route. Schema đã push.

### Step 5.6 · Viết blog cho landing page (2 phút mỗi bài, optional nhưng quan trọng cho SEO)

Với mỗi landing page đã approved, CEO có thể host blog riêng tại `app.1person.ai/pages/:subdomain/blog/:postSlug` — giống `bap-software.net/knowledge/`.

**CEO làm:** mở landing page detail → tab "Blog" (mới) → "New post".

**CEO thấy:** editor TipTap rich text:
- Toolbar: Bold, Italic, Heading, Lists, Quote, Image, Undo/Redo
- Title + slug (auto-gen từ title)
- Cover image uploader
- Main content area prose style
- SEO panel: meta title / description / keywords
- Actions: Save draft / Publish / Unpublish

**CEO làm:** viết title, paste content, upload ảnh bìa, click Image trong toolbar để upload thêm ảnh vào bài (reuse asset-library endpoint), click Publish.

**Kết quả:** bài live ngay tại `/pages/:subdomain/blog/:slug`, có SEO metadata, CEO có thể share đường link này trong social + campaigns khác. Blog list public ở `/pages/:subdomain/blog`.

> **Wire check:** Đợt 5 Agent H đang build — TipTap editor + CRUD backend + public pages. Schema `landing_page_blog_posts` đã push.

### Step 6 · Action thứ hai — Thêm đối thủ (3 phút)

**CEO click:** back → /insights → Go → "Thêm đối thủ".

**CEO thấy:** `/market` empty state với nút "Add competitor".

**CEO click:** Add competitor. Dialog:
- Name (required)
- URL (optional — AI sẽ scan nếu có)
- Keywords (comma-separated, AI gợi ý từ Brain)

**CEO click:** Save → thấy competitor card vừa tạo + nút "**Scan now (5 credits)**".

**CEO click:** Scan now.

**Hệ thống làm (15-30s):**
- Jina Reader fetch website URL (free)
- Google News RSS search keyword + competitor name (free)
- LLM extract signals + SWOT delta + recommended action
- Save to market_scans + update competitor.latest_signals
- Charge 5 credits

**CEO thấy:** competitor card update — hiển thị 3-5 signals (icon + text + link + date) + "Last scanned 30s ago" + optional badge "SWOT update available → Accept".

**CEO click:** Accept SWOT update (optional) → Brain → Market Position tự động update.

> **Wire check:** Agent A (Đợt 3) đang build cái này. End-to-end = UI button → POST scan → services/market-scan.ts → Jina + RSS + LLM → save + return → render.

### Step 7 · Action thứ ba — Bổ sung Sales Playbook (5 phút)

**CEO click:** back → /insights → Go → "Bổ sung Sales Playbook".

**CEO thấy:** `/brain` với tab "Sales playbook" được auto-select (query param).

**CEO thấy form có 5 phần — đã pre-filled từ LLM autoextract:**
- ICP (auto-draft từ Brain persona)
- Qualification rules (3-5 bullet AI gợi ý)
- Objections & responses (template với 3 objection phổ biến theo industry)
- Closing lines (AI soạn sẵn 2-3)
- Email templates (AI soạn sẵn 2 template: intro + follow-up)

**CEO review:** chỉnh 1-2 dòng cho hợp voice riêng → Save.

> **Wire check:** ✅ Brain UI có (Đợt 2). **Gap cần fix:** hiện tại Sales Playbook tab **không auto-draft** — form trống khi mở. **Cần thêm:** khi save ICP lần đầu, extend brain-autoextract để populate Sales Playbook. *[Gap → Đợt 4]*

### Step 8 · Deal đầu tiên — AI viết email cho CEO (2 phút)

**CEO click:** `/sales` từ sidebar.

**CEO thấy:** Kanban empty + banner "Create your first deal to let the AI Deal Assistant help you close".

**CEO click:** New deal → dialog (Title, Contact, Company, Value) → Save → deal card xuất hiện ở Discovery column.

**CEO click:** vào deal card → panel detail mở bên phải.

**CEO thấy trong panel:**
- Deal info
- Event timeline (1 event "Created")
- Big button **"Ask AI Assistant (3 credits)"**

**CEO click:** Ask AI Assistant.

**Hệ thống làm (5-10s):**
- Fetch deal + events + Sales Playbook + Brain snapshot
- LLM call với Chief Sales Officer persona
- Return JSON: nextAction, reasoning, likelyObjection, objectionResponse, emailDraft, confidence

**CEO thấy trong panel (inline, không reload):**
- "Next action: Gửi email giới thiệu personalized trong 24h tới"
- "Why: Deal ở discovery stage, không có contact history. Email dẫn với [specific hook from Brain]"
- "Likely objection: Too expensive — Response: ..."
- **Email draft card:**
  - Subject line
  - Body (đã viết sẵn, personalized, dùng Brain voice)
  - **Nút lớn "Copy email"** — click → clipboard → toast "Copied"
- Confidence gauge: 78%

**CEO làm:** Mở Gmail/Outlook/Zalo của riêng mình → paste → edit 1 dòng → send. (1Person KHÔNG gửi thay, đây là philosophy core.)

**CEO quay lại:** click "Set as next action" → deal.nextAction updated, event `ai_suggestion` được append vào timeline.

> **Wire check:** Agent B (Đợt 3) đang build cái này. End-to-end = UI button → POST /assist → services (LLM with Brain+events) → return → render inline → Copy button → clipboard API.

### Step 9 · Upload meeting → Brain tự học (background, 0 click thêm)

**CEO làm sau một cuộc họp team:** mở `/knowledge` → tab "Meetings" → upload file audio.

**Hệ thống làm (30s–2 phút):**
- Whisper (local faster-whisper-server, free) transcribe
- LLM analyze transcript → extract: summary, decisions, tasks, marketInsights, salesObjections, keywords
- **Meeting → Brain extraction** (Task 11.6 đã có): push insights vào `brain_campaign_learnings` với categories:
  - `[Market] ...` (insight)
  - `[Objection] ...` (fail — friction to fix)
  - `[Strategy] ...` (win hoặc insight)

**CEO thấy:** meeting card có summary + decisions + tasks.

**Tác động ngầm nhưng quan trọng:** lần tới CEO Advisor refresh → nó sẽ đọc được learnings mới. Next Deal Assistant call → sẽ nhắc "bạn vừa nghe objection X trong meeting hôm qua, hãy proactively address it". Next Campaign → sẽ generate content nói về decisions vừa ra.

> **Wire check:** ✅ Meeting → Brain đã có (Task 11.6). **Cần test:** lần refresh CEO Advisor thứ 2 sau khi upload meeting, brief có reference learnings không.

### Step 10 · Daily loop (30s/ngày)

Ngày hôm sau CEO mở laptop, click sidebar "CEO Advisor":

- Thấy brief cũ (từ hôm qua) + timestamp "Last refreshed 18 hours ago"
- Click **Refresh advice**
- 10s sau, brief mới:
  - Top action: "Follow up deal X — đã 2 ngày không hoạt động, trị giá $5k"
  - Win: "Campaign Y có CTR 3.2%, vượt benchmark"
  - Alert: "Đối thủ Z vừa giảm giá 20% hôm qua" (từ market scan)
- CEO click "Go →" ở action #1 → /sales → deal X → Ask AI Assistant → copy email → send → next action updated
- **Tổng cộng: 3 click, 2 phút, CEO biết + hành động đúng thứ ưu tiên**

---

## §2 — Map các gap phát hiện được

Sau khi viết walkthrough này, phát hiện gap cần fix trong **Đợt 4** (sau khi Đợt 3 xong):

| # | Gap | Severity | Estimate |
|---|---|---|---|
| G1 | FTUX "Meet your Brain" preview screen chưa có | High — onboarding first impression | 1h |
| G2 | Dashboard `/{companyId}` cho CEO mới vẫn hiển thị KPI kỹ thuật thay vì "what needs attention today" | High | 1h |
| G3 | Sales Playbook tab không auto-draft từ Brain industry — form trắng scary | Medium | 1h |
| G4 | CEO Advisor Refresh dialog không preview credit cost đủ nổi bật | Low | 15m |
| G5 | Deal Assistant copy email — nếu `navigator.clipboard` fail (iOS Safari old) cần fallback | Low | 15m |
| G6 | Admin approval blocking new signups — cần "Try it" mode không cần approval cho test-drive | High — kills trial | 30m |
| G7 | Onboarding "guided tour" tooltip lần đầu đi sidebar (đã có component `GuidedTour` nhưng chưa wire cho Market / Sales / CEO Advisor) | Medium | 30m |

Tổng Đợt 4: ~5h — làm sau khi verify Đợt 3 chạy được.

---

## §3 — Điểm test cho Đợt 3 khi agents xong

Dựa trên walkthrough này, 7 điểm test cần click-verify:

1. **Step 5 Campaign flow** — tạo campaign đầu tiên xuyên suốt, không break vì thiếu Brain
2. **Step 6 Market** — Add competitor → Scan now → thấy signals thật (Jina + RSS phải trả data, LLM phải parse ra signals hợp lý)
3. **Step 6 Scan credit** — Scan now đúng 5 credits, thất bại không bị trừ
4. **Step 7 Sales Playbook** — tab Sales Playbook lưu + reload được (đã verify Đợt 2)
5. **Step 8 Deal Assistant** — Ask AI → render inline email draft có Copy button + click Copy thực sự vào clipboard
6. **Step 8 stage change** — drag/select stage thay đổi → event `stage_change` được append vào timeline
7. **Step 10 CEO Advisor refresh** — sau khi có ít nhất 1 campaign + 1 deal + 1 scan + 1 meeting → Refresh → brief có reference data từ 4 sources (xem `sources_used` field trong response)

Nếu 7 điểm này pass → Đợt 3 coi như ship được cho CEO đầu tiên.

---

## §4 — Ngoài scope doc này

- Thanh toán / upgrade plan → có sẵn ở /settings/credits
- Multi-company support → CEO có thể tạo nhiều company, nhưng walkthrough này focus 1 company đầu tiên
- Localization (VI/EN) → i18n đã có từ Đợt 0, chỉ cần QA strings
- Mobile responsive polish → doc 08 P0-C5 (sau)
