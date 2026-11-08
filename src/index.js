// Cloudflare Worker: phục vụ game (thư mục public/) và API bảng xếp hạng dùng D1.
import { DIFFICULTIES, insertScore, parseLimit, topScores, validateScore } from "./scores.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health") {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ status: "ok", db: row?.ok === 1 });
  }

  if (url.pathname === "/api/scores") {
    if (request.method === "GET") {
      const difficulty = url.searchParams.get("difficulty");
      if (difficulty && !DIFFICULTIES.includes(difficulty)) {
        return json({ error: "Độ khó không hợp lệ" }, 400);
      }
      const limit = parseLimit(url.searchParams.get("limit"));
      const scores = await topScores(env.DB, { difficulty, limit });
      return json({ scores });
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Body phải là JSON" }, 400);
      }
      const result = validateScore(body);
      if (!result.ok) return json({ error: result.error }, 400);
      const saved = await insertScore(env.DB, result.value);
      return json({ score: saved }, 201);
    }

    return json({ error: "Method không được hỗ trợ" }, 405);
  }

  return json({ error: "Không tìm thấy" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err);
        return json({ error: "Lỗi máy chủ" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
