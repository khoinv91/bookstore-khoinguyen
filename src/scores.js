// Logic bảng xếp hạng: kiểm tra dữ liệu và truy vấn D1.

export const DIFFICULTIES = ["easy", "normal", "hard"];
export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 1_000_000;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

/**
 * Kiểm tra dữ liệu gửi điểm. Trả về { ok: true, value } hoặc { ok: false, error }.
 */
export function validateScore(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Dữ liệu không hợp lệ" };
  }

  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length === 0) return { ok: false, error: "Thiếu tên người chơi" };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Tên tối đa ${MAX_NAME_LENGTH} ký tự` };
  }

  const score = input.score;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { ok: false, error: "Điểm không hợp lệ" };
  }

  const difficulty = input.difficulty ?? "normal";
  if (!DIFFICULTIES.includes(difficulty)) {
    return { ok: false, error: "Độ khó không hợp lệ" };
  }

  return { ok: true, value: { name, score, difficulty, won: input.won === true } };
}

export function parseLimit(raw) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function insertScore(db, { name, score, difficulty, won }) {
  const row = await db
    .prepare(
      "INSERT INTO scores (name, score, difficulty, won) VALUES (?, ?, ?, ?) RETURNING id, created_at"
    )
    .bind(name, score, difficulty, won ? 1 : 0)
    .first();
  return { id: row.id, name, score, difficulty, won, created_at: row.created_at };
}

export async function topScores(db, { difficulty, limit }) {
  const sql = difficulty
    ? "SELECT name, score, difficulty, won, created_at FROM scores WHERE difficulty = ? ORDER BY score DESC, created_at ASC, id ASC LIMIT ?"
    : "SELECT name, score, difficulty, won, created_at FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ?";
  const stmt = difficulty ? db.prepare(sql).bind(difficulty, limit) : db.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return results.map((r) => ({ ...r, won: r.won === 1 }));
}
