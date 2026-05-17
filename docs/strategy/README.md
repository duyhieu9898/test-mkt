# 1Person AI — Strategy Docs

> Deep research + product vision + build plan để 1Person trở thành **best-in-world AI marketing platform** trước cuối 2027.
>
> Origin: research session ngày 2026-05-16. Two parallel research agents (codebase inventory + competitive market research) → synthesis.

---

## Files

| File | Mục đích | Khi nào đọc |
|---|---|---|
| [2027-product-vision.md](./2027-product-vision.md) | Verdict ngắn + vision sản phẩm 2027 + 5 moat zones | Đầu tiên — hiểu "north star" |
| [competitive-research-2026.md](./competitive-research-2026.md) | Full landscape: Surfer, Frase, Jasper, HubSpot Breeze, Agentforce, Sintra, Profound, GEO/LLMO tools, pricing, 2026 trends | Khi cần justify một feature decision hoặc benchmark |
| [current-feature-inventory.md](./current-feature-inventory.md) | Snapshot codebase 1Person tại 2026-05-16 — what's shipped, partial, missing với file:line evidence | Khi cần biết "chúng ta đã có gì rồi" |
| [build-now-plan.md](./build-now-plan.md) | **18 tuần / 9 blocks** ordering — implementation status tracking | **File sống** — cập nhật mỗi tuần |

---

## Cách dùng

1. Đọc `2027-product-vision.md` để align về north star.
2. Khi bắt đầu một block, mở `build-now-plan.md`, tick từng task khi xong, ghi PR/commit link vào cột Status.
3. Khi research thay đổi (competitor ship cái mới, hoặc bạn quyết định pivot), update `competitive-research-2026.md` + bump version ở đầu file.
4. Sau mỗi block ship xong, update `current-feature-inventory.md` để snapshot mới làm baseline cho block tiếp theo.

---

## Liên kết với docs khác

- [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) — overall platform status (đã có từ trước). `build-now-plan.md` ở đây là **tactical 18 tuần tới**; file IMPLEMENTATION_STATUS là big-picture.
- [`../brainstorm/`](../brainstorm/) — design specs chi tiết per engine. Khi ship block cần chi tiết hơn, link vào đây.
- [`../../CLAUDE.md`](../../CLAUDE.md) — project principles. Mọi feature mới phải tuân thủ (microservices, event-driven, plugin architecture, agent-as-microservice).

---

*Owner: Dao Thanh (founder)*
*Maintainer: cập nhật mỗi lần ship 1 block*
