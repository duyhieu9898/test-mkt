# Easy Platform Connect for Non-Tech Founders — Research & Recommendation

> Ngày: 2026-05-25
> Vấn đề: cách connect hiện tại (dán Page Access Token, GA4 Property ID, WordPress Application Password, OAuth thủ công) **quá kỹ thuật** cho CEO/founder non-tech. Mục tiêu: tìm cách connect dễ hơn, lý tưởng là "bấm một nút" hoặc "không cần connect gì cả".
> Bối cảnh: gợi ý của founder — mô hình **Claude for Chrome**: nói "xem campaign Facebook của tôi" → extension xin quyền tab Facebook đang mở → chụp màn hình → phân tích.
> Liên quan: [`marketingskills-integration-tracker.md`](./marketingskills-integration-tracker.md) (T04 social publish hiện dùng Page token dán tay — chính là cái cần thay).

---

## 0. Kết luận trong 30 giây

Lý do connect hiện tại khó **không phải vì OAuth** — mà vì ta đang bắt user **dán token/ID thủ công** (việc chỉ dev làm được). Non-tech founder **bấm được "Login with Facebook"**, nhưng **không** tự tạo nổi Page Access Token trong Graph API Explorer hay tìm GA4 Property ID.

**Có 4 nhóm giải pháp, phục vụ 2 nhu cầu khác nhau:**

| Nhu cầu | Giải pháp đúng |
|---|---|
| **PHÂN TÍCH ad-hoc** ("nhìn campaign FB của tôi") | Chụp/đọc màn hình (screenshot-vision hoặc browser agent) — **không cần connect** |
| **THỰC THI + lên lịch** (đăng bài, gửi email, chạy nền) | Bắt buộc có token lưu sẵn → **OAuth "Login with X" làm đúng cách** hoặc **aggregator** |

**Khuyến nghị:** làm theo thứ tự (1) sửa OAuth cho đúng + **auto-discovery** (bỏ hẳn bước dán ID/token) → (2) thêm **"Screenshot → phân tích"** (rẻ, không cần connect, đúng ví dụ Claude-for-Chrome) → (3) dùng **aggregator** để phủ nhiều nền tảng nhanh → (4) browser-agent/extension chỉ làm sau nếu thực sự cần.

---

## 1. Vì sao cách hiện tại khó (chẩn đoán đúng bệnh)

Hiện trạng các điểm connect:
- **Facebook (omnichannel + social publish):** founder phải vào Meta Developer, tạo app, lấy **Page Access Token** + Verify Token, dán vào `/channels`. → 95% non-tech bỏ cuộc ở đây.
- **GA4 (P4):** "Connect Google" (OAuth — ổn) **nhưng** sau đó phải tự tìm + dán **GA4 Property ID**. → bước dán ID là rào cản.
- **GSC:** OAuth Google (ổn) nhưng cần biết site URL khớp.
- **WordPress:** dán site URL + **Application Password**. → khá ổn nhưng vẫn cần biết tạo App Password.

**Mẫu số chung:** chỗ nào bắt **gõ/dán một chuỗi bí ẩn** (token, ID, secret) là chỗ non-tech tắc. OAuth popup ("đăng nhập + đồng ý") thì họ làm được — đó là việc họ làm hằng ngày.

> ✅ **Đòn bẩy lớn nhất, rẻ nhất: bỏ MỌI bước "dán chuỗi". Thay bằng OAuth login + auto-discovery** (ta tự gọi API liệt kê page / GA4 property / site cho họ **chọn từ dropdown**).

---

## 2. Bốn nhóm giải pháp + đánh giá

### A. First-party OAuth làm đúng cách + auto-discovery ⭐ (nền tảng)
Ta tự đăng ký **1 app Meta + 1 app Google** (verified, đủ scope). User chỉ thấy: **"Đăng nhập với Facebook/Google" → đồng ý → chọn Page/Property từ danh sách**. Token do ta đổi & lưu ngầm; user không bao giờ thấy token/ID.

- Auto-discovery (mấu chốt non-tech): sau khi login Google → gọi **GA4 Admin API** liệt kê property → dropdown chọn (bỏ bước dán ID). Sau khi login FB → gọi `/me/accounts` liệt kê Page → dropdown chọn (bỏ bước dán token).
- ✅ Chuẩn ngành (Buffer, Hootsuite, Zapier... đều vậy). Chạy nền/lên lịch được (lưu refresh token). Reversible. Non-tech làm được.
- ⚠️ Cần **app review** của Meta/Google cho scope ghi (`pages_manage_posts`, `ads_read`, `analytics.readonly`...) — công một lần, vài ngày–vài tuần. Cần cấu hình redirect URI + privacy policy.
- 💰 Miễn phí (chỉ công làm + review).
- **Ta đã có 80% nền** (Google OAuth cho GSC/GA4 đã chạy). Chủ yếu là: (a) thêm auto-discovery, (b) làm OAuth thật cho Facebook thay vì dán token.

### B. Screenshot → Vision phân tích (zero-connect) ⭐ (đòn delight rẻ nhất cho READ)
User mở Ads Manager / GA4 / bất kỳ trang nào → **chụp màn hình → kéo-thả vào app** → vision model (Claude) đọc & phân tích. **Không OAuth, không token, không extension.**

- ✅ Cực kỳ non-tech ("chụp màn hình rồi thả vào đây" — ai cũng làm được). Hoạt động với **mọi nền tảng** kể cả thứ không có API. Làm được **ngay** (ta đã có vision LLM). Đúng tinh thần ví dụ Claude-for-Chrome nhưng **không phải build extension**.
- ⚠️ Chỉ **đọc/phân tích**, không đăng/lên lịch được. Là ảnh tĩnh (không live). Người dùng phải tự mở trang + chụp.
- 💰 Gần như free (chỉ chi phí vision token).
- **80/20 hoàn hảo:** lấy ~80% giá trị ví dụ của founder mà không cần build extension. Là **fallback toàn năng** khi chưa/không connect được.

### C. Integration Aggregator (phủ rộng nhanh)
Dùng dịch vụ bên thứ 3 có sẵn connector + UI link tài khoản hosted, **đã được review** với các nền tảng:
- **Ayrshare** — chuyên social (FB/IG/LinkedIn/X/TikTok/YouTube/Pinterest/Reddit): đăng + lên lịch + analytics qua 1 API + UI link tài khoản hosted. Rất hợp non-tech cho social. ⚠️ **tính phí theo từng profile** (~$9/profile/tháng → ~$900/tháng cho 100 tài khoản) → đắt khi scale.
- **Composio** — agent-native, managed OAuth + actions + triggers cho HubSpot/Salesforce/Meta Ads/LinkedIn... (chính marketingskills đang dùng). Có free tier.
- **Nango / Paragon** — embedded OAuth tổng quát (700+ API). Paragon có sẵn UI connect cho user. Nango code-first ($50/tháng+).

- ✅ Khỏi xin app review từng nền tảng (aggregator đã có); UI link hosted thân thiện; chạy nền được.
- ⚠️ Phụ thuộc bên thứ 3 + chi phí + data đi qua họ. Vẫn là OAuth bên dưới (họ lo phần khó).
- 💰 Ayrshare đắt khi nhiều tài khoản; Composio/Nango rẻ hơn.
- **Dùng khi:** muốn phủ NHIỀU nền tảng nhanh mà không đủ sức xin review từng cái.

### D. Browser agent / Computer-use (đúng ví dụ Claude-for-Chrome nhất)
- **Khuyên dùng Claude for Chrome ngay (không build gì):** đã mở beta cho mọi gói trả phí (Pro/Max/Team/Enterprise). Đọc/thao tác tab đang mở, navigate dashboard analytics rồi tóm tắt. Founder có thể dùng **hôm nay** cho việc "nhìn campaign FB của tôi" — ta chỉ cần hướng dẫn.
- **Tự build extension / Computer-Use API (Anthropic):** ta điều khiển browser server-side; user login 1 lần, agent navigate Ads Manager đọc số.
  - ✅ Phủ mọi nền tảng, không API/OAuth, đúng mental model của founder.
  - ⚠️ **Nặng để build**, chậm/đắt/experimental, rủi ro bảo mật (trao quyền điều khiển browser), **không tin cậy cho tự động hoá theo lịch** (cần user + tab mở), cân nhắc ToS (scraping). Login vẫn cần.
  - 💰 Cao (computer-use tốn token + hạ tầng).
- **Dùng khi:** đã làm xong A/B/C mà vẫn cần "nhìn màn hình live"; còn không thì recommend Claude for Chrome là đủ.

---

## 3. Bảng so sánh

| Tiêu chí | A. OAuth + auto-discovery | B. Screenshot→Vision | C. Aggregator | D. Browser agent |
|---|---|---|---|---|
| Non-tech dễ dùng | ✅ Cao (bấm + chọn) | ✅✅ Cao nhất (kéo ảnh) | ✅ Cao (UI hosted) | 🟡 Vừa (cần cài/điều khiển) |
| Đọc/phân tích | ✅ | ✅ | ✅ | ✅ |
| Đăng/thực thi | ✅ | ❌ | ✅ | 🟡 (mong manh) |
| Chạy nền/lên lịch | ✅ | ❌ | ✅ | ❌ |
| Công build | 🟡 Vừa (đã có nền) | 🟢 Thấp | 🟡 Vừa (tích hợp) | 🔴 Cao |
| App review cần? | ⚠️ Có (1 lần) | ❌ Không | ❌ (aggregator lo) | ❌ |
| Chi phí | 🟢 Free | 🟢 ~Free | 🟡 Theo dùng/profile | 🔴 Cao |
| Phụ thuộc ngoài | Không | Không | Có (vendor) | Có (Anthropic) |

---

## 4. Khuyến nghị — lộ trình (mỗi bước vẫn theo 4 cổng G1–G4 + đưa vào Walkthrough)

**✅ Phase C1 — Screenshot→Vision analyzer — ĐÃ SHIP (2026-05-25).**
"Dán/kéo ảnh chụp Ads Manager / GA4 / báo cáo → AI đọc & phân tích → gợi ý hành động." Không OAuth. Code: `routes/vision-analyze.ts` (Anthropic vision, sonnet-4, inject Brand IQ + skill framework tùy chọn) mount `/vision`; `ScreenshotAnalyzer` trên `/analytics` (drop/paste/upload, preview, hỏi tùy chọn, output markdown + copy); walkthrough §5. Là fallback toàn năng + delight ngay khi chưa connect được.

**Phase C2 — OAuth đúng cách + auto-discovery (đòn nền tảng cho các nền tảng cốt lõi).**
- GA4: sau "Connect Google" → liệt kê property cho chọn dropdown (bỏ bước dán Property ID).
- Facebook: thay dán Page Token bằng **"Login with Facebook" → chọn Page từ danh sách** (cần đăng ký Meta app + review `pages_manage_posts`/`pages_read_engagement`).
- Đây là cái biến T04/P4 từ "dev-only" thành "non-tech".

**Phase C3 — Aggregator cho độ phủ rộng (khi cần nhiều nền tảng nhanh).**
Đánh giá **Ayrshare** (social, nhanh nhưng đắt theo profile) vs **Composio** (rẻ, agent-native, marketingskills đã dùng) cho Instagram/LinkedIn/X/TikTok publish + ads platforms — tránh phải tự xin review từng cái.

**Phase C4 — Browser agent (tùy chọn, sau cùng).**
Trước mắt **hướng dẫn founder dùng Claude for Chrome** cho nhu cầu "nhìn tab live". Chỉ tự build extension/computer-use nếu C1–C3 chưa đủ.

**Phase C5 — "1Person Publisher" WordPress plugin (one-click connect cho WP) ⭐.**
Thay vì bắt non-tech tự tạo Application Password (cách Claude/MCP cũng dùng — xem ảnh founder gửi: WordPress.com Claude Connector / Easy MCP AI plugin), ta phát hành **plugin "1Person" trên WP.org**: founder cài plugin → bấm **"Connect to 1Person"** → plugin tự cấp Application Password/token + đăng ký site với ta (ta lưu **đã mã hoá** — đã làm). Đây là "Login with X" phiên bản WordPress — non-tech nhất cho WP, và là artifact nhỏ gọn (plugin PHP) chứ không nặng như browser extension.
- Việc cần: plugin PHP nhỏ + endpoint pairing phía ta (`/integrations/wordpress/pair`).
- MCP: cho dùng tương tác (Claude Desktop) — KHÔNG cần cho autopilot server-side của ta (ta dùng REST trực tiếp). Có thể expose publishing qua MCP sau.
- Trước mắt: Application Password vẫn chạy (đã mã hoá). Plugin là nâng cấp UX connect.

**Phase C6 — Auto banner + social post (founder yêu cầu).**
Đã có nền: launcher tự draft social text (FB/LI/IG) + creative/banner engine (multi-size, gradient) + image-gen (DALL-E/Gemini/Banana). Còn thiếu: (1) tự sinh **banner social-size** (1080×1080 / 1200×628) kèm mỗi bài, gắn vào social step của autopilot; (2) one-click social connect (C2) để draft thật sự đăng được. → gộp vào roadmap sau khi C2.

---

## 5. Lưu ý trung thực (tradeoffs)
- **Screenshot/extension KHÔNG thay được OAuth cho việc đăng/lên lịch tự động** — ảnh tĩnh không đăng bài theo lịch được. Đừng kỳ vọng nó làm last-mile execution.
- **App review (Meta/Google)** là công một lần không tránh được nếu muốn "Login with X" cho quyền ghi — nhưng làm xong là dùng mãi cho mọi user.
- **Aggregator** nhanh nhưng tạo phụ thuộc + chi phí theo tăng trưởng (đặc biệt Ayrshare per-profile).
- **Browser agent / computer-use**: cân nhắc bảo mật + ToS + độ tin cậy trước khi tự build.

---

## 6. Cần founder quyết
1. Làm **Phase C1 (Screenshot→Vision)** trước? (rẻ, nhanh, đúng ví dụ của bạn, không cần đăng ký gì).
2. Có sẵn sàng **đăng ký + review Meta/Google app** (cho C2 "Login with X") không? — đây là việc một lần nhưng cần bạn (chủ tài khoản) tham gia.
3. Với social đa nền tảng: tự làm OAuth từng cái, hay dùng **aggregator** (chấp nhận chi phí/phụ thuộc)?

## Nguồn (tra cứu 2026)
- [Get started with Claude in Chrome — Claude Help Center](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome)
- [Claude for Chrome — claude.com](https://claude.com/claude-for-chrome)
- [Claude in Chrome: A Threat Analysis — Zenity Labs](https://labs.zenity.io/p/claude-in-chrome-a-threat-analysis)
- [Ayrshare — Social Media APIs for Posting, Scheduling, Analytics](https://www.ayrshare.com/)
- [7 best Nango alternatives for AI agents (2026) — Composio](https://composio.dev/content/nango-alternatives-ai-agents)
- [Best unified API platforms 2026 — Nango](https://nango.dev/blog/best-unified-api/)
- [The 10 Best Unified API Platforms in 2026 — Ampersand](https://www.withampersand.com/blog/the-10-best-unified-api-platforms-in-2026)
- [10 Best Unified Social Media APIs for Developers in 2026 — Outstand](https://www.outstand.so/blog/best-unified-social-media-apis-for-devs)
