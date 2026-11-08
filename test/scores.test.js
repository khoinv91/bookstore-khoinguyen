import { describe, expect, it } from "vitest";
import { MAX_LIMIT, parseLimit, validateScore } from "../src/scores.js";

describe("validateScore", () => {
  it("chấp nhận dữ liệu hợp lệ và chuẩn hoá tên", () => {
    const r = validateScore({ name: "  Khởi   Nguyễn ", score: 1200, difficulty: "hard", won: true });
    expect(r).toEqual({ ok: true, value: { name: "Khởi Nguyễn", score: 1200, difficulty: "hard", won: true } });
  });

  it("mặc định độ khó là normal và won là false", () => {
    const r = validateScore({ name: "A", score: 0 });
    expect(r.ok).toBe(true);
    expect(r.value.difficulty).toBe("normal");
    expect(r.value.won).toBe(false);
  });

  it.each([
    [null, "Dữ liệu không hợp lệ"],
    [{ score: 10 }, "Thiếu tên người chơi"],
    [{ name: "   ", score: 10 }, "Thiếu tên người chơi"],
    [{ name: "x".repeat(21), score: 10 }, "Tên tối đa 20 ký tự"],
    [{ name: "A", score: -1 }, "Điểm không hợp lệ"],
    [{ name: "A", score: 1.5 }, "Điểm không hợp lệ"],
    [{ name: "A", score: "100" }, "Điểm không hợp lệ"],
    [{ name: "A", score: 2_000_000 }, "Điểm không hợp lệ"],
    [{ name: "A", score: 5, difficulty: "insane" }, "Độ khó không hợp lệ"],
  ])("từ chối %j", (input, error) => {
    expect(validateScore(input)).toEqual({ ok: false, error });
  });
});

describe("parseLimit", () => {
  it("dùng mặc định 10 khi thiếu hoặc sai", () => {
    expect(parseLimit(null)).toBe(10);
    expect(parseLimit("abc")).toBe(10);
    expect(parseLimit("-3")).toBe(10);
  });
  it("giới hạn tối đa", () => {
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("9999")).toBe(MAX_LIMIT);
  });
});
