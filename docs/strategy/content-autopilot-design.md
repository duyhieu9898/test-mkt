# Content Autopilot — Design & Tracking

> Ngày: 2026-05-25 · Trạng thái: **đang build** (P8)
> Nhu cầu gốc (founder): trang WordPress như **bap-blockchain.com** cần **1-2 bài blog/ngày tự động**, SEO + GEO, để B2B tìm "blockchain development" được recommend BAP — **không cần ngồi canh**.
> Vì sao không dùng Chrome extension: extension chạy trong browser của user (cần mở máy + ngồi đó) → KHÔNG chạy nền/lịch được. Automation server-side mới đúng. Xem [`easy-platform-connect-research.md`](./easy-platform-connect-research.md).

## Mục tiêu
Bật 1 lần → mỗi ngày tự: chọn keyword kế tiếp → sinh bài (giọng Brand IQ, framework copywriting/SEO) → publish **draft** lên WordPress → seed GEO tracking → (tùy chọn) draft social. Founder chỉ vào WP duyệt & bấm Publish.

## Tái dùng (đã có sẵn ~90%)
- `launch-orchestrator.ts` `startLaunch({companyId, keyword, targets})` — chuỗi blog→ảnh→WP draft→social draft→GEO seed, fire-and-forget, lưu tiến độ vào `campaign_launches`.
- `blog-generator` (đã có framework copywriting P1) + Brand IQ (giọng BAP) + `cms-integration` (WP REST publish) + `geo-tracker` + worker (`setInterval` pattern).

## Phần MỚI cần build
1. **Schema** `content_autopilot` (1 dòng/công ty) + cột `source` trên `campaign_launches` để phân biệt manual vs autopilot. Mig `0010`.
   - Fields: `enabled`, `postsPerDay` (1-2), `targets` (wp/fb/li/ig), `keywordQueue` (string[] — hàng đợi chủ đề), `usedKeywords` (string[]), `mode` ('draft' mặc định | 'autopublish' tương lai), `lastRunAt`, `nextRunAt`.
2. **Service** `content-autopilot.ts`: `getConfig`, `upsertConfig`, `runOnce(companyId)` (lấy keyword kế → `startLaunch` → xoay vòng queue → cập nhật next/lastRunAt), `runDue()` (cho scheduler).
3. **Routes** `autopilot.ts`: `GET /:companyId`, `PUT /:companyId` (bật/nhịp/keyword/targets), `POST /:companyId/run-now` (test thủ công ngay), `GET /:companyId/history` (các launch gần đây). Mount `/autopilot`.
4. **Scheduler** (in-API `setInterval`, ~15') gọi `runDue()` — **chỉ tác động công ty đã bật**; tạo **draft** (human-in-the-loop). Để test được ngay mà không cần worker chạy riêng.
5. **UI** `/autopilot`: form cấu hình (bật, nhịp, keyword list, targets) + nút **"Run now"** (test 1 vòng ngay) + lịch/history (đọc từ `campaign_launches`). Sidebar + **Walkthrough §2**.

## Tuân thủ nguyên tắc
- **Human-in-the-loop:** mặc định publish **DRAFT** lên WP — founder duyệt trong WP rồi mới đăng. Auto-publish là opt-in (tương lai).
- **Không cron ngầm bừa** ([[feedback_no_background_crons]]): scheduler **chỉ chạy cho công ty đã chủ động bật autopilot**; còn lại không làm gì. Đây là tính năng founder yêu cầu rõ, không phải auto-refresh ngầm.
- **4 cổng G1–G4** + có trong Walkthrough để founder test toàn bộ.

## So với thị trường (job "auto-blog hằng ngày cho BAP")
- Claude+Chrome: không chạy nền/lịch, không brand voice/SEO/GEO riêng → thua.
- marketingskills: cần dev + terminal, không scheduler/UI → non-tech không dùng được.
- **1Person + Autopilot: chạy nền, brand-aware, publish WP API thật, track GEO → thắng.**

## Tracking
Mỗi bước log vào [`marketingskills-integration-tracker.md`](./marketingskills-integration-tracker.md) (phase P8) với file:line.
