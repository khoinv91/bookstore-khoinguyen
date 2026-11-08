// Dùng trong GitHub Actions trước khi deploy:
// 1. Tìm database D1 theo tên trong wrangler.jsonc trên tài khoản Cloudflare.
// 2. Nếu chưa có thì tự tạo (location gần Việt Nam: apac).
// 3. Ghi database_id thật vào wrangler.jsonc (chỉ trong máy chạy CI, không commit).
// Cần biến môi trường CLOUDFLARE_API_TOKEN và CLOUDFLARE_ACCOUNT_ID.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = "wrangler.jsonc";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const config = readFileSync(CONFIG, "utf8");
const name = config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
if (!name) throw new Error(`Không tìm thấy database_name trong ${CONFIG}`);

function wrangler(...args) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function findDatabase() {
  const list = JSON.parse(wrangler("d1", "list", "--json"));
  return list.find((db) => db.name === name);
}

let db = findDatabase();
if (db) {
  console.log(`Đã có D1 "${name}" (${db.uuid})`);
} else {
  console.log(`Chưa có D1 "${name}", đang tạo mới...`);
  wrangler("d1", "create", name, "--location", "apac");
  db = findDatabase();
  if (!db) throw new Error(`Tạo D1 "${name}" thất bại`);
  console.log(`Đã tạo D1 "${name}" (${db.uuid})`);
}

if (!config.includes(PLACEHOLDER)) {
  console.log("wrangler.jsonc đã có database_id, giữ nguyên.");
} else {
  writeFileSync(CONFIG, config.replace(PLACEHOLDER, db.uuid));
  console.log("Đã điền database_id vào wrangler.jsonc");
}
