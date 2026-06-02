# 1Person vs `marketingskills` (Corey Haines) — So sánh & Chiến lược tích hợp

> Ngày: 2026-05-24
> Repo đối chiếu: https://github.com/coreyhaines31/marketingskills (đã clone về `/Users/thanhdao/Projects/marketing_skill_sample_github`)
> Phương pháp: đọc toàn bộ 41 skill + bộ `tools/` của họ, đối chiếu với code thực tế đã ship của ta (verify từng file).
> License của họ: **MIT** (Copyright (c) 2025 Corey Haines) → ta **được phép copy, sửa, merge, sublicense, bán**, miễn giữ lại copyright notice + license text. Đây là điều kiện pháp lý lý tưởng để hấp thụ.

---

## 0. Kết luận trong 30 giây

**Hai dự án KHÁC BẢN CHẤT — không cạnh tranh, mà bổ sung gần như hoàn hảo.**

| | `marketingskills` (họ) | 1Person (ta) |
|---|---|---|
| Bản chất | Thư viện **kiến thức** (41 file markdown "skill") + 63 **CLI tool** kết nối dịch vụ thật | **Nền tảng SaaS** có UI/UX, multi-tenant, thực thi (publish/gửi/chat thật) |
| Người dùng | Lập trình viên / marketer kỹ thuật dùng AI coding agent (Claude Code, Cursor...) | **Founder không rành kỹ thuật** dùng dashboard web |
| Giao diện | **KHÔNG có UI/UX** — chỉ markdown + CLI chạy terminal | Đầy đủ dashboard 40 màn hình |
| Giá trị cốt lõi | **Chiều sâu kiến thức** marketing (playbook chuẩn chuyên gia) + tích hợp dữ liệu thật | **Thực thi tự động** + trải nghiệm cho người không code |

> **Họ là "bộ não/thư viện kiến thức". Ta là "cơ thể + giao diện + tay chân thực thi".** Ghép lại = sản phẩm mạnh hơn cả hai. Đúng như bạn nhận xét: họ chỉ là CLI chưa có UI/UX — đó chính là khoảng trống ta lấp, và chiều sâu kiến thức của họ chính là khoảng trống ta đang thiếu.

---

## 1. Bản chất từng dự án (đọc kỹ trước khi so chức năng)

### 1.1 `marketingskills` thực ra là gì
- **41 "skill"** = mỗi skill là 1 folder chứa `SKILL.md` (150–500 dòng playbook marketing rất sâu) + `references/*.md` (chi tiết tràn ra, có file 600+ dòng) + `evals/evals.json` (bộ test chấm điểm hành vi agent). **Tổng 257 eval.**
- Đây **không phải phần mềm chạy được** — nó là **tài liệu hướng dẫn cho AI agent**. Khi bạn cài vào project, agent (Claude Code/Cursor...) "đọc" skill phù hợp rồi áp dụng framework đó.
- **`tools/`**: 63 file CLI JavaScript (zero-dependency, dùng `fetch` native) gọi **API thật** của GA4, Ahrefs, Klaviyo, Apollo, Stripe, Meta Ads... + 88 file hướng dẫn tích hợp (`integrations/*.md`) + lớp Composio/MCP cho ~104 dịch vụ. Auth toàn bộ qua **biến môi trường** (`{TOOL}_API_KEY`), có `--dry-run`, không hardcode secret.
- **Pattern nền tảng**: skill `product-marketing` tạo ra file `.agents/product-marketing.md` (doc định vị 12 phần). **Mọi skill khác đọc file này trước** → grounding chung, không hỏi lại context.
- Chất lượng kiến thức: **rất cao**. Đọc như playbook nội bộ của senior growth consultant — có benchmark thật, anti-pattern, "common mistakes", bắt buộc output có cấu trúc. Ví dụ `ab-testing` có sample-size table + cảnh báo "peeking problem" + ICE prioritization; `seo-audit` cảnh báo `curl` strip thẻ `<script>` nên JSON-LD phải check bằng browser.

### 1.2 1Person thực ra là gì
- **Monorepo SaaS**: `apps/api` (Hono), `apps/web` (Next.js, 40 màn hình dashboard), `packages/core` (Drizzle schema), multi-tenant, credits/billing, RBAC, admin panel.
- **Thực thi thật** (không chỉ tư vấn): xuất bản blog lên WordPress thật, gửi email thật (Resend/SendGrid), chatbot trả lời thật bằng LLM, FB Messenger webhook thật, sinh ảnh thật (DALL-E/Gemini/Banana), landing page publish lên subdomain thật.
- **Tính năng độc đáo** không nơi nào có: Brain Hub (ingestion + watcher/reaction phản ứng tự động), Gamification (Growth Score/Missions/Streaks), AI Employees có personality + memory RAG (pgvector), Campaign Launcher 1-click.
- **Điểm yếu**: prompt/kiến thức marketing **rất nông**. Ví dụ skill registry hiện tại: `system: "You are an expert marketing copywriter"` — 1 câu. Trong khi skill `copywriting` của họ là 252 dòng có công thức headline, bảng section, công thức CTA, anti-pattern. **Đây chính là thứ ta thiếu và họ thừa.**

---

## 2. Ma trận đối chiếu 41 skill của họ ↔ trạng thái của ta

Chú thích: ✅ có & sâu · 🟡 có nhưng nông/thiếu / chỉ 1 phần · ❌ chưa có gì · "KT" = ta thiếu **kiến thức/framework** (prompt nông) · "TT" = ta thiếu **thực thi/tích hợp**

### SEO & Content
| Skill của họ | Ta có? | Hiện trạng của ta | Thiếu gì |
|---|---|---|---|
| `seo-audit` (audit kỹ thuật) | ❌ | Chỉ có content grader + GSC rank | KT + TT — chưa có technical audit (crawl/CWV/index) |
| `ai-seo` (GEO/LLMO) | ✅ | `geo-tracker.ts` poll OpenAI+Anthropic, share-of-voice | Thiếu Perplexity/Gemini, framework AEO/GEO sâu (KT) |
| `site-architecture` | ❌ | — | KT — chưa có IA/sitemap/internal-link planner |
| `programmatic-seo` | ❌ | Doc only | KT + TT — chưa có engine sinh trang theo template+data |
| `schema` (JSON-LD) | 🟡 | Auto FAQPage + Article | Thiếu Product/HowTo/Org/Breadcrumb (KT) |
| `content-strategy` | 🟡 | LLM gợi ý topic liên quan | Thiếu topic cluster/editorial calendar (KT) |
| `aso` (App Store) | ❌ | — | KT — không có |
| `competitors` (trang so sánh) | 🟡 | `competitor-comparison.ts` có brief | Chưa sinh trang "X alternatives" cho SEO (KT+TT) |
| `directory-submissions` | ❌ | — | KT — danh sách 100+ directory + flow submit |
| `customer-research` | ✅ | `market-scan`, `competitor-brief`, **Brain Hub** | Khá mạnh; thiếu framework JTBD/confidence-label (KT) |

### CRO
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `cro` (phân tích trang) | 🟡 | Có **landing page builder** nhưng không có framework chấm CRO | KT — framework 7 chiều phân tích conversion |
| `signup` | ❌ | — | KT |
| `onboarding` | ❌* | Ta có onboarding cho SẢN PHẨM TA, không phải skill tối ưu onboarding cho user | KT |
| `popups` | ❌ | — | KT |
| `paywalls` | ❌ | Có paywall billing của ta, không phải skill | KT |

### Content & Copy
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `copywriting` | 🟡 | `blog-generator` viết blog thật | KT — prompt 1 câu, thiếu framework sâu |
| `copy-editing` | ❌ | — | KT — passes biên tập, plain-english |
| `cold-email` | 🟡 | `outreach-engine` gửi email thật | KT — thiếu framework cold outreach B2B |
| `emails` (lifecycle) | ✅ | Engine sequence thật (Resend/SendGrid) | KT — thiếu thư viện lifecycle flow; thiếu visual builder (TT) |
| `social` | 🟡 | Sinh draft thật; **publish là STUB** | TT — publisher Meta chưa wire; KT framework |
| `sms` | ❌ | — | KT + TT — chưa có provider SMS |
| `image` | ✅ | DALL-E/Gemini/Banana thật | Khá đủ |
| `video` | 🟡 | Chỉ script + scene, **không render** | TT — chưa render video thật |

### Paid & Measurement
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `ads` | 🟡 | `ads-engine` sinh creative; **không push lên platform** | TT — chưa push Meta/Google Ads thật |
| `ad-creative` | ✅ | Sinh creative bằng LLM thật | KT framework iterate |
| `ab-testing` | 🟡 | Chỉ template, **không có runner/stat** | KT + TT — chưa có engine chạy + tính ý nghĩa thống kê |
| `analytics` | 🟡 | Tracking nội bộ của ta + GSC | TT — chưa tích hợp GA4/Mixpanel/Segment |

### Growth & Retention
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `churn-prevention` | ❌ | — | KT — cancel flow/dunning/payment recovery |
| `referrals` | ❌ | — | KT — referral/affiliate program |
| `free-tools` | ❌ | — | KT — engineering-as-marketing |
| `lead-magnets` | ❌ | — | KT |
| `community-marketing` | ❌ | — | KT |
| `co-marketing` | ❌ | — | KT |
| `competitor-profiling` | ✅ | `competitor-brief`, `market-scan`, positioning map | Khá mạnh |

### Sales & GTM
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `revops` | 🟡 | Lead capture + scoring thật | KT — lifecycle/routing/handoff |
| `sales-enablement` | ❌ | — | KT — pitch deck/one-pager/objection |
| `launch` (GTM) | 🟡 | **Campaign Launcher** (launch nội dung) | KT — playbook GTM (Product Hunt/waitlist) |
| `pricing` | ❌ | Chỉ có billing của ta | KT — Van Westendorp/value metric/packaging |

### Strategy
| Skill | Ta có? | Hiện trạng | Thiếu |
|---|---|---|---|
| `marketing-ideas` | 🟡 | 5 playbook mặc định | KT — họ có ~139 idea theo stage |
| `marketing-psychology` | ❌ | — | KT — mental models/behavioral science |
| `product-marketing` (nền tảng) | ✅ | **Brand IQ** ≈ chính nó (auto-extract → voice/persona/style) | KT — bổ sung JTBD Four Forces, verbatim language, anti-persona |

### Tổng kết ma trận
- **✅ Ta đã mạnh (8):** customer-research, competitor-profiling, ai-seo/GEO, ad-creative, image, emails (engine), copywriting (engine), product-marketing (= Brand IQ).
- **🟡 Có nhưng nông hoặc thiếu last-mile (13):** schema, content-strategy, competitors, cro, social, video, ads, ab-testing, analytics, cold-email, revops, launch, marketing-ideas.
- **❌ Chưa có gì (20):** seo-audit, site-architecture, programmatic-seo, aso, directory-submissions, signup, onboarding, popups, paywalls, copy-editing, sms, churn-prevention, referrals, free-tools, lead-magnets, community-marketing, co-marketing, sales-enablement, pricing, marketing-psychology.

> **Bức tranh thật:** trong 41 lĩnh vực marketing họ chuẩn hóa, ta mới phủ sâu ~8, nông ~13, trống ~20. Nhưng phần lớn cái thiếu là **KIẾN THỨC (KT)** — mà kiến thức của họ là MIT, copy được. Phần thiếu **THỰC THI (TT)** thì code CLI của họ cũng dùng được luôn.

---

## 3. GIỐNG nhau ở đâu

1. **Triết lý "smart prompt là nền tảng"** — họ dồn toàn lực vào chất lượng prompt/framework; ta cũng coi đây là cốt lõi (memory `feedback_smart_prompts`). Cùng hệ tư tưởng.
2. **Pattern "context nền tảng đọc trước"** — họ: `product-marketing.md`. Ta: **Brand IQ** inject vào đầu mọi agent (`business-context.ts`). Cùng ý tưởng, ta đã làm UI cho nó.
3. **Khái niệm "skill" có thể đăng ký/khám phá** — họ: spec agentskills.io. Ta: `skill-registry-service.ts` + bảng `skills`/`agentSkills` + marketplace. **Ta đã có sẵn khung chứa skill của họ.**
4. **Khái niệm "tool" kết nối dịch vụ ngoài** — họ: `tools/clis/*` + `integrations/*`. Ta: `tool-registry-service.ts` + bảng `executionTools` + `companyToolCredentials`. **Ta đã có sẵn khung chứa CLI của họ.**
5. Phủ các domain marketing trùng nhau: SEO, copywriting, ads, email, social, competitor, image/video, pricing...

---

## 4. KHÁC nhau (mỗi bên có gì bên kia không)

### 4.1 Họ có — ta CHƯA có
- **Chiều sâu kiến thức theo từng skill** — đây là khác biệt lớn nhất. 200–500 dòng framework/skill, có references, có anti-pattern, có benchmark thật.
- **Tích hợp dịch vụ thật rộng** — 63 CLI + 88 guide cho ~104 dịch vụ (GA4, Ahrefs, Semrush, DataForSEO, Klaviyo, Customer.io, Mailchimp, Apollo, Clearbit, Clay, Stripe, Meta/Google/LinkedIn/TikTok Ads, Twilio/Postscript SMS, Rewardful referral...). Đây lấp đúng các "last-mile" của ta (ads push, analytics, SEO data, SMS).
- **Bộ eval 257 case** — chấm cả chất lượng output lẫn routing/boundary. Ta **chưa có eval harness** cho agent.
- **20 lĩnh vực marketing ta đang trống** (xem mục 2): churn/dunning, referral/affiliate, sales-enablement, pricing research, marketing-psychology, sms, aso, programmatic-seo, technical seo-audit, directory submissions, copy-editing, popups, signup/onboarding optimization, free-tools, lead-magnets, community/co-marketing.
- **Tính di động đa-agent (Claude Code/Cursor/Codex/Windsurf)** — chuẩn mở. (Ít liên quan tới ta vì ta là SaaS đóng.)

### 4.2 Ta có — họ KHÔNG có
- **UI/UX cho người không code** — họ hoàn toàn không có. Đây là toàn bộ giá trị thị trường của ta với non-tech founder.
- **Thực thi thật end-to-end**: publish WordPress, gửi email, chatbot LLM, FB Messenger, landing page publish, sinh ảnh — họ chỉ "hướng dẫn", ta "làm".
- **Multi-tenant SaaS + billing/credits + admin panel + RBAC.**
- **Brain Hub** — ingestion source-agnostic + watcher/reaction tự động (draft FAQ, handoff Campaign Launcher). Họ không có khái niệm runtime phản ứng.
- **AI Employees** có personality + DM chat + memory RAG (pgvector) — trải nghiệm "nhân viên ảo".
- **Gamification** (Growth Score/Missions/Streaks) — không đối thủ nào có.
- **Campaign Launcher 1-click** (blog → ảnh → WP draft → social draft → GEO seed).
- **Omnichannel inbox** (FB Messenger thật + viewer).
- **Orchestration agent** (DAG, queue, playbooks, marketplace).

---

## 5. Cái gì ta CHƯA LÀM ĐƯỢC (gap để đóng)

Xếp theo mức độ "thị trường đã làm tốt → ta nên copy":

**Nhóm A — Kiến thức (copy markdown của họ vào, gần như miễn phí):**
1. Toàn bộ 20 skill ta đang trống ở mục 2 (churn, referral, pricing, sales-enablement, psychology, copy-editing, signup, onboarding, popups, paywalls, free-tools, lead-magnets, sms-framework, aso, directory, site-architecture...).
2. Làm sâu 13 skill đang nông (cro framework, copywriting framework, ads framework, ab-testing, content-strategy cluster, schema mở rộng...).

**Nhóm B — Thực thi/tích hợp (adapt CLI của họ):**
3. **Live ads push** (Meta/Google Ads) — ta đã sinh creative, thiếu đẩy lên platform.
4. **GA4 / analytics thật** — ta chỉ có tracking nội bộ.
5. **SEO data thật** (Ahrefs/Semrush/DataForSEO) — ta chỉ có GSC.
6. **Social publish thật** — publisher Meta có sẵn nhưng **chưa wire** (đang là stub).
7. **SMS** (Twilio/Postscript) — chưa có gì.
8. **Email lifecycle nâng cao** (Klaviyo/Customer.io) + visual drip builder.
9. **A/B test runner** thật (có stat significance).
10. **Video render** thật.

**Nhóm C — Hạ tầng chất lượng:**
11. **Eval harness** cho agent (mượn format 257 eval của họ).
12. **Technical SEO audit / programmatic SEO engine.**

---

## 6. ⭐ CHIẾN LƯỢC TÍCH HỢP SOURCE CỦA HỌ (trả lời câu hỏi của bạn)

> Bạn hỏi: "họ chỉ là CLI chưa có UI/UX, ta kết hợp source code của họ vào thế nào?"
>
> **Trả lời ngắn:** Ta KHÔNG bê nguyên CLI vào (vì CLI = giao diện terminal cho dev, trái với nguyên tắc non-tech của ta). Ta tách làm 2 lớp và đổ vào **2 cái khung ta ĐÃ có sẵn**:
> - **Lớp kiến thức (41 SKILL.md)** → đổ vào `skill-registry-service.ts` / bảng `skills` → trở thành "bộ não" cho agent & feature của ta. Người dùng không thấy markdown, chỉ thấy kết quả tốt hơn.
> - **Lớp tool (63 CLI)** → bóc logic gọi API, đổ vào `tool-registry-service.ts` / bảng `executionTools` + `companyToolCredentials` → đổi auth từ env-var sang admin UI + DB (đúng nguyên tắc của ta). Người dùng bấm nút trong UI, không gõ terminal.

### 6.1 Lớp KIẾN THỨC — biến SKILL.md thành "bộ não" của ta

**Vấn đề hiện tại:** `skill-registry-service.ts` có `MARKETING_SKILLS` với prompt 1 câu. Brain Hub/AI Employees/blog-generator dùng prompt nông.

**Cách làm:**
1. Tạo thư mục `packages/core/src/knowledge/marketing-skills/` và **copy nguyên 41 SKILL.md + references/** từ repo họ vào (kèm `LICENSE` của Corey Haines + ghi nguồn — bắt buộc theo MIT).
2. Viết một **loader** đọc các SKILL.md này thành bản ghi trong bảng `skills` (đã có schema): map frontmatter `name`/`description` → triggers; map nội dung → `definition.prompts.system`. Đây là thay thế trực tiếp các prompt 1-câu hiện tại.
3. **Wire vào nơi đã có UI** (theo nguyên tắc "không dead code"):
   - `blog-generator` / content editor → nạp framework `copywriting` + `copy-editing` + `seo-audit`.
   - `ads-engine` → nạp `ads` + `ad-creative`.
   - `outreach-engine` → nạp `emails` + `cold-email`.
   - Landing page / CRO → nạp `cro` + `copywriting`.
   - **AI Employees**: mỗi nhân viên ảo gắn 1 nhóm skill làm "chuyên môn" (vd "Sara - Growth" mang churn/referral/pricing). Đây là UX bán được ngay.
   - **Brain Hub**: nạp skill làm tài liệu tham chiếu cho watcher/reaction.
4. **Pattern product-marketing → Brand IQ**: bổ sung schema Brand IQ theo 12 phần của họ (thêm JTBD Four Forces, verbatim customer language, anti-persona). Brand IQ đã inject vào mọi agent → nâng cấp 1 chỗ, lợi mọi nơi.
5. **20 skill domain mới** (churn, referral, pricing, psychology...) → mỗi cái thành một "capability" mới của AI Employee hoặc một card trong dashboard tương ứng, **ship dần từng nhóm nhỏ** (không đổ 41 cái 1 lần — tuân thủ "không batch 2000 dòng").

> Lưu ý non-tech UX: **không bao giờ show file markdown thô trên UI**. Skill chạy ngầm; user chỉ thấy "Kết quả viết bởi chuyên gia copywriting" với output có cấu trúc đẹp.

### 6.2 Lớp TOOL — biến 63 CLI thành tích hợp 1-click

**Vấn đề:** CLI của họ auth bằng env-var, output JSON ra terminal — hợp cho dev, KHÔNG hợp cho non-tech founder và trái nguyên tắc `feedback_admin_config_ui` (key phải qua admin UI + DB).

**Cách làm:**
1. **Bóc lõi mỗi CLI** (phần `fetch` gọi API + map request/response) thành một service trong `apps/api/src/services/integrations/{tool}.ts`. Bỏ phần đọc env-var và in stdout.
2. Đăng ký mỗi tool vào `executionTools` (schema đã có: `apiEndpoint`, `authMethod`, `inputSchema`, `costPerCall`...). Lấy `integrations/{tool}.md` của họ làm metadata (endpoint, rate limit, auth format).
3. **Auth qua `companyToolCredentials`** (bảng đã có) + admin/onboarding UI để founder dán key (hoặc OAuth). Đây đúng pattern ta cần và họ đã giải sẵn các "quirk" auth (vd Klaviyo cần header `revision`, Apollo nhét key vào body).
4. Ưu tiên đóng đúng các last-mile (mục 5 nhóm B):
   - `ga4.js` → analytics thật.
   - `google-ads.js` + meta ads → ads push thật.
   - `ahrefs.js`/`dataforseo.js` → SEO data thật.
   - `klaviyo.js`/`customer-io.js` → email nâng cao.
   - Twilio/Postscript → SMS.
5. Giữ tinh thần **`--dry-run`** của họ thành chế độ "preview trước khi gửi" trong UI — rất hợp với "human-in-the-loop" của ta.

> Pattern dịch: **1 CLI của họ = 1 service + 1 entry `executionTools` + 1 ô nhập key trong admin UI + 1 nút trong feature UI.** Đó là cách "mặc áo UI" cho CLI của họ.

### 6.3 Lớp EVAL — mượn để dựng chất lượng

- Copy format `evals/evals.json` (257 case) làm bộ test cho agent của ta. Mỗi lần đổi prompt skill → chạy eval để không tụt chất lượng. Đây là thứ ta đang hoàn toàn thiếu và họ làm rất bài bản.

### 6.4 Tuân thủ pháp lý (MIT)
- Giữ file `LICENSE` gốc của Corey Haines trong thư mục copy.
- Thêm dòng ghi nguồn trong doc/README nội bộ: "Marketing knowledge skills adapted from coreyhaines31/marketingskills (MIT)".
- Được phép sửa, đổi tên, dịch sang tiếng Việt, sublicense trong sản phẩm thương mại của ta.

---

## 7. Roadmap tích hợp đề xuất (chia phase nhỏ, ship liên tục)

> Nguyên tắc: mỗi phase phải **wire tới UI** và **đủ nhỏ để review** (theo `feedback_code_must_ship_to_ui`).

| Phase | Nội dung | Khung tận dụng | Kết quả thấy được trên UI |
|---|---|---|---|
| **P1 — Knowledge loader** | Copy 41 SKILL.md vào repo + loader đổ vào bảng `skills`; thay 3–4 prompt nông nhất (copywriting, ads, cro, emails) | `skill-registry-service.ts` | Output blog/ads/landing chất lượng tăng rõ rệt |
| **P2 — Brand IQ = product-marketing++** | Mở rộng schema Brand IQ theo 12 phần (JTBD, verbatim, anti-persona) | `brand-iq-extractor.ts`, `business-context.ts` | Brand IQ sâu hơn, mọi agent hưởng lợi |
| **P3 — AI Employee chuyên môn hóa** | Gắn nhóm skill vào từng nhân viên ảo (Growth/SEO/Sales...) | `team-service.ts` | Mỗi nhân viên "biết" 1 mảng marketing sâu |
| **P4 — Tool registry: analytics + SEO data** | Adapt `ga4.js`, `ahrefs.js`/`dataforseo.js` → service + admin key UI | `tool-registry-service.ts`, `companyToolCredentials` | Dashboard hiện số liệu thật |
| **P5 — Last-mile thực thi** | Wire social publisher (đang stub) + ads push (Meta/Google) + SMS | services/channels, ads-engine | Bấm Publish là đăng thật |
| **P6 — Skill domain mới** | Ship dần churn / referral / pricing / sales-enablement / psychology... | skill registry + dashboard cards | Tính năng mới mỗi đợt |
| **P7 — Eval harness** | Port 257 eval làm regression test cho agent | (mới) | Chất lượng prompt không tụt |

**Khuyến nghị bắt đầu: P1 + P2** — chi phí thấp nhất (chủ yếu copy markdown), tác động cao nhất (nâng chất lượng mọi feature đang chạy), và tận dụng đúng 2 khung `skill-registry`/`Brand IQ` ta đã có.

> 📋 **Theo dõi tiến độ tích hợp tại [`marketingskills-integration-tracker.md`](./marketingskills-integration-tracker.md)** — file PM nguồn-sự-thật-duy-nhất: lấy gì, lấp gap nào, đã wire vào code/UI/walkthrough chưa, trạng thái từng item. Mỗi lần lấy thứ gì từ họ phải cập nhật file đó.

---

## 8. Một câu chốt

Repo của họ chứng minh **kiến thức marketing đã được chuẩn hóa rất tốt và miễn phí (MIT)** — ta **không nên tự viết lại**, mà hấp thụ. Nhưng họ **không có UI/UX, không thực thi, không multi-tenant** — đó là toàn bộ phần ta đã xây và là moat của ta với founder không rành kỹ thuật. **Chiến lược đúng: lấy "bộ não" của họ + "cơ thể & giao diện" của ta.** Đừng cạnh tranh ở lớp markdown; hãy cạnh tranh ở lớp "non-tech founder bấm nút là ra kết quả thật".
