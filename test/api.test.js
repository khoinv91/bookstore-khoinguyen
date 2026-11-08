import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const BASE = "https://example.com";
const worker = () => exports.default;

function post(body) {
  return worker().fetch(`${BASE}/api/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("API bảng xếp hạng (D1)", () => {
  // Xoá dữ liệu trước mỗi test để các test không ảnh hưởng nhau
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM scores").run();
  });

  it("health check kết nối được D1", async () => {
    const res = await worker().fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: true });
  });

  it("danh sách rỗng khi chưa có điểm", async () => {
    const res = await worker().fetch(`${BASE}/api/scores`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scores: [] });
  });

  it("lưu điểm rồi trả về theo thứ tự cao xuống thấp", async () => {
    for (const [name, score, difficulty] of [["An", 300, "easy"], ["Bình", 900, "hard"], ["Chi", 500, "easy"]]) {
      const res = await post({ name, score, difficulty });
      expect(res.status).toBe(201);
    }

    const all = await (await worker().fetch(`${BASE}/api/scores`)).json();
    expect(all.scores.map((s) => s.name)).toEqual(["Bình", "Chi", "An"]);

    const easy = await (await worker().fetch(`${BASE}/api/scores?difficulty=easy`)).json();
    expect(easy.scores.map((s) => s.score)).toEqual([500, 300]);

    const top1 = await (await worker().fetch(`${BASE}/api/scores?limit=1`)).json();
    expect(top1.scores).toHaveLength(1);
    expect(top1.scores[0]).toMatchObject({ name: "Bình", score: 900, difficulty: "hard", won: false });
  });

  it("dữ liệu test trước không bị lẫn sang test sau", async () => {
    const res = await worker().fetch(`${BASE}/api/scores`);
    expect((await res.json()).scores).toEqual([]);
  });

  it("trả về bản ghi vừa lưu", async () => {
    const res = await post({ name: "Khởi", score: 1500, difficulty: "normal", won: true });
    const { score } = await res.json();
    expect(score).toMatchObject({ name: "Khởi", score: 1500, difficulty: "normal", won: true });
    expect(score.id).toBeTypeOf("number");
  });

  it("từ chối dữ liệu sai với mã 400", async () => {
    expect((await post({ name: "", score: 10 })).status).toBe(400);
    expect((await post({ name: "A", score: -5 })).status).toBe(400);
    expect((await post("không phải json")).status).toBe(400);
    const bad = await worker().fetch(`${BASE}/api/scores?difficulty=xyz`);
    expect(bad.status).toBe(400);
  });

  it("method không hỗ trợ trả 405, đường dẫn API lạ trả 404", async () => {
    expect((await worker().fetch(`${BASE}/api/scores`, { method: "DELETE" })).status).toBe(405);
    expect((await worker().fetch(`${BASE}/api/khong-co`)).status).toBe(404);
  });
});

describe("Trang game (static assets)", () => {
  it("trang chủ trả về HTML của game", async () => {
    const res = await worker().fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("MARIO TỰ CHẾ");
    expect(html).toContain('src="leaderboard.js"');
  });

  it.each(["/game.js", "/style.css", "/leaderboard.js"])("phục vụ file %s", async (p) => {
    const res = await worker().fetch(`${BASE}${p}`);
    expect(res.status).toBe(200);
  });
});
