import { env } from "cloudflare:test";
import { applyD1Migrations } from "cloudflare:test";

// Tạo bảng trong D1 giả lập (an toàn khi chạy nhiều lần)
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
