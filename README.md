# Mario Tự Chế

Game Mario chạy trên **Cloudflare Workers**, có **bảng xếp hạng** lưu trên **Cloudflare D1**.
Mỗi lần push lên nhánh `main`, GitHub Actions tự **chạy test** rồi **deploy**.

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `public/` | Game (HTML, JS, CSS) + `leaderboard.js` (gửi điểm, xem bảng xếp hạng) |
| `src/index.js` | Worker: phục vụ game và API `/api/scores`, `/api/health` |
| `src/scores.js` | Kiểm tra dữ liệu + truy vấn D1 |
| `migrations/` | Cấu trúc bảng D1 |
| `test/` | Test tự động (chạy trên runtime Workers thật, D1 giả lập) |
| `.github/workflows/ci-cd.yml` | Quy trình CI/CD |
| `scripts/ensure-d1.mjs` | Tự tạo D1 nếu chưa có khi deploy |

## Quy trình CI/CD

- **Pull request vào `main`** → chạy test + kiểm tra build.
- **Push vào `main`** → test → tạo D1 (nếu chưa có) → chạy migrations → deploy → kiểm tra trang web sống.

## Thiết lập lần đầu (chỉ làm 1 lần)

1. **Lấy Account ID**: vào dash.cloudflare.com → Workers & Pages → cột phải có **Account ID**.
2. **Tạo API Token**: dash.cloudflare.com → avatar → **My Profile → API Tokens → Create Token** →
   chọn mẫu **Edit Cloudflare Workers** → ở phần Permissions bấm **+ Add more** thêm
   `Account · D1 · Edit` → **Continue → Create Token** → copy token.
3. **Thêm secrets vào GitHub**: repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = token vừa tạo
   - `CLOUDFLARE_ACCOUNT_ID` = Account ID
4. Vào tab **Actions** → chọn **CI/CD** → **Run workflow** (hoặc push code mới).

Link game sẽ hiện ở tab Actions, dạng `https://mario-tu-che.<ten-ban>.workers.dev`.

## Chạy trên máy

```bash
npm install
npm test                      # chạy test
npm run db:migrate:local      # tạo bảng D1 trên máy
npm run dev                   # mở http://localhost:8787
```
