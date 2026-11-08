// Test đầu-cuối (E2E): mở game trên trình duyệt Chrome thật, chạy Worker + D1 local,
// bấm như người chơi thật và kiểm tra toàn bộ luồng chơi + bảng xếp hạng.
import { expect, test } from "@playwright/test";

// ---------- Tiện ích ----------
const menu = (page) => page.locator("#screen-menu");
const overlay = (page) => page.locator("#overlay");
const scoreForm = (page) => page.locator("#score-form");

/** Ghi lại mọi lỗi JavaScript trên trang; cuối mỗi test phải không có lỗi nào. */
test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.on("pageerror", (err) => page.__errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
      page.__errors.push(`console.error: ${msg.text()}`);
    }
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(menu(page)).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, "Không được có lỗi JavaScript trên trang").toEqual([]);
});

async function startGame(page, { players = 1 } = {}) {
  await page.getByRole("button", { name: players === 1 ? "Chơi 1 người" : "Chơi 2 người (chung bàn phím)" }).click();
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await expect.poll(() => page.evaluate("appState")).toBe("playing");
}

/** Giả lập kết thúc lượt chơi với số điểm cho trước. */
async function loseRun(page, score) {
  await page.evaluate((s) => {
    score = s;
    for (const p of players) { p.lives = 1; p.invincibleUntil = 0; }
    for (const p of players) handlePlayerDeath(p);
  }, score);
  await expect(overlay(page)).toBeVisible();
}

async function winGame(page, score) {
  await page.evaluate((s) => { score = s; winRun(); }, score);
  await expect(overlay(page)).toBeVisible();
}

async function submitScore(page, name) {
  await page.locator("#score-name").fill(name);
  await page.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(page.locator("#score-status")).toHaveText("Đã lưu điểm!");
}

async function openLeaderboard(page) {
  await page.getByRole("button", { name: "Bảng xếp hạng" }).click();
  await expect(page.locator("#screen-leaderboard")).toBeVisible();
  await expect(page.locator("#lb-list")).not.toContainText("Đang tải");
}

// ---------- Menu & màn hình cài đặt ----------
test.describe("Menu và cài đặt", () => {
  test("menu hiển thị đủ các nút", async ({ page }) => {
    await expect(page).toHaveTitle("Mario Tự Chế");
    await expect(page.getByRole("heading", { name: "MARIO TỰ CHẾ" })).toBeVisible();
    for (const name of [
      "Chơi 1 người", "Chơi 2 người (chung bàn phím)", "Chơi màn tự tạo",
      "Trình tạo màn chơi", "Đổi phím điều khiển", "Độ khó", "Bảng xếp hạng",
    ]) {
      await expect(menu(page).getByRole("button", { name, exact: true })).toBeVisible();
    }
    // Chưa có màn tự tạo -> nút bị khoá
    await expect(page.getByRole("button", { name: "Chơi màn tự tạo" })).toBeDisabled();
  });

  test("đổi độ khó và được nhớ sau khi tải lại trang", async ({ page }) => {
    await page.getByRole("button", { name: "Độ khó" }).click();
    await page.getByRole("button", { name: /^Khó/ }).click();
    await expect(page.getByRole("button", { name: /^Khó/ })).toHaveClass(/selected/);
    await page.reload();
    expect(await page.evaluate("difficultyKey")).toBe("hard");
    await page.getByRole("button", { name: "Độ khó" }).click();
    await expect(page.getByRole("button", { name: /^Khó/ })).toHaveClass(/selected/);
    await page.getByRole("button", { name: "Quay lại" }).click();
    await expect(menu(page)).toBeVisible();
  });

  test("đổi phím điều khiển", async ({ page }) => {
    await page.getByRole("button", { name: "Đổi phím điều khiển" }).click();
    const jumpP1 = page.locator('.rebind-btn[data-player="1"][data-action-key="jump"]');
    await expect(jumpP1).toHaveText("W");
    await jumpP1.click();
    await expect(page.locator("#rebind-hint")).toContainText("Nhảy/Bay");
    await page.keyboard.press("k");
    await expect(jumpP1).toHaveText("K");
    expect(await page.evaluate("controls1.jump")).toBe("k");
    await page.getByRole("button", { name: "Lưu & Quay lại" }).click();
    await expect(menu(page)).toBeVisible();
  });

  test("chọn nhân vật cho 1 và 2 người", async ({ page }) => {
    await page.getByRole("button", { name: "Chơi 1 người" }).click();
    await expect(page.locator("#char-grid-p1 .char-card")).toHaveCount(6);
    await expect(page.locator("#charselect-p2-col")).toBeHidden();
    await page.locator("#char-grid-p1 .char-card").nth(2).click();
    expect(await page.evaluate("selectedChar.p1")).toBe("son");
    await page.getByRole("button", { name: "Về menu" }).click();

    await page.getByRole("button", { name: "Chơi 2 người (chung bàn phím)" }).click();
    await expect(page.locator("#charselect-p2-col")).toBeVisible();
    await expect(page.locator("#char-grid-p2 .char-card")).toHaveCount(6);
  });
});

// ---------- Chơi game ----------
test.describe("Chơi game", () => {
  test("bắt đầu 1 người: game chạy, nhân vật di chuyển và nhảy được", async ({ page }) => {
    await startGame(page);
    expect(await page.evaluate("players.length")).toBe(1);
    expect(await page.evaluate("players[0].lives")).toBe(3);

    const x0 = await page.evaluate("players[0].x");
    await page.keyboard.down("d");
    await page.waitForTimeout(600);
    await page.keyboard.up("d");
    expect(await page.evaluate("players[0].x")).toBeGreaterThan(x0);

    // Nhảy: chờ đứng trên mặt đất rồi bấm W
    await expect.poll(() => page.evaluate("players[0].onGround")).toBe(true);
    const y0 = await page.evaluate("players[0].y");
    await page.keyboard.down("w");
    await page.waitForTimeout(150);
    await page.keyboard.up("w");
    expect(await page.evaluate("players[0].y")).toBeLessThan(y0);
  });

  test("màn hình game thực sự được vẽ (canvas thay đổi theo thời gian)", async ({ page }) => {
    await startGame(page);
    const snap = () => page.locator("#gameCanvas").screenshot();
    const a = await snap();
    await page.keyboard.down("d");
    await page.waitForTimeout(500);
    await page.keyboard.up("d");
    const b = await snap();
    expect(a.equals(b)).toBe(false);
  });

  test("cả 4 màn chơi đều tải và chạy được không lỗi", async ({ page }) => {
    await startGame(page);
    const stages = await page.evaluate("runStages.length");
    expect(stages).toBe(4);
    for (let i = 0; i < stages; i++) {
      await page.evaluate((idx) => {
        stageIndex = idx;
        spawnStage(runStages[idx]);
        for (const p of players) p.invincibleUntil = performance.now() + 60_000; // không chết khi test
      }, i);
      // Bấm loạn phím trong 1.5 giây như người chơi thật
      for (const k of ["d", "w", "g", "a", "w", "d", "s", "g"]) {
        await page.keyboard.down(k);
        await page.waitForTimeout(90);
        await page.keyboard.up(k);
      }
      expect(await page.evaluate("gameState")).toMatch(/playing|won/);
      if ((await page.evaluate("gameState")) === "won") break;
    }
  });

  test("chơi 2 người tạo đủ 2 nhân vật", async ({ page }) => {
    await startGame(page, { players: 2 });
    expect(await page.evaluate("players.map(p => p.character.id)")).toEqual(["dad", "mom"]);
    const x0 = await page.evaluate("players[1].x");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");
    expect(await page.evaluate("players[1].x")).toBeGreaterThan(x0);
  });

  test("mất 1 mạng (còn mạng): không hiện form lưu điểm, bấm Tiếp tục chơi tiếp", async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => { score = 300; players[0].invincibleUntil = 0; handlePlayerDeath(players[0]); });
    await expect(page.locator("#overlay-text")).toHaveText("Mất 1 mạng! Còn 2 mạng.");
    await expect(scoreForm(page)).toBeHidden();
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(overlay(page)).toBeHidden();
    expect(await page.evaluate("gameState")).toBe("playing");
    expect(await page.evaluate("score")).toBe(300);
  });

  test("trình tạo màn chơi: đặt khối, lưu, rồi chơi màn tự tạo", async ({ page }) => {
    await page.getByRole("button", { name: "Trình tạo màn chơi" }).click();
    await page.getByRole("button", { name: "Đất" }).click();
    const canvas = page.locator("#gameCanvas");
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.9 } });
    expect(await page.evaluate("editorGrid.flat().filter(c => c === 1).length")).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Lưu màn chơi" }).click();
    await expect(page.getByRole("button", { name: "Đã lưu ✓" })).toBeVisible();
    await page.locator("#screen-editor-toolbar").getByRole("button", { name: "Về menu" }).click();

    await expect(page.getByRole("button", { name: "Chơi màn tự tạo" })).toBeEnabled();
    await page.getByRole("button", { name: "Chơi màn tự tạo" }).click();
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect.poll(() => page.evaluate("appState")).toBe("playing");
    expect(await page.evaluate("runStages.length")).toBe(1);
  });
});

// ---------- Bảng xếp hạng (D1) ----------
test.describe("Bảng xếp hạng", () => {
  test("thua -> nhập tên -> lưu điểm -> hiện trên bảng xếp hạng", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 1234);
    await expect(page.locator("#overlay-text")).toHaveText("Thua rồi! Điểm: 1234");
    await expect(scoreForm(page)).toBeVisible();
    await submitScore(page, "Người Test Thua");
    await expect(page.getByRole("button", { name: "Lưu điểm" })).toBeDisabled();

    await page.getByRole("button", { name: "Về menu" }).click();
    await openLeaderboard(page);
    await expect(page.locator("#lb-list")).toContainText("Người Test Thua — 1234 điểm (Thường)");
  });

  test("thắng ở độ khó Khó -> có cúp 🏆 và lọc đúng theo độ khó", async ({ page }) => {
    await page.getByRole("button", { name: "Độ khó" }).click();
    await page.getByRole("button", { name: /^Khó/ }).click();
    await page.getByRole("button", { name: "Quay lại" }).click();
    await startGame(page);
    await winGame(page, 98765);
    await expect(page.locator("#overlay-text")).toHaveText("Chúc mừng, đã qua hết các màn! Điểm: 98765");
    await submitScore(page, "Vô Địch");

    await page.getByRole("button", { name: "Về menu" }).click();
    await openLeaderboard(page);
    // Điểm cao nhất đứng đầu
    await expect(page.locator("#lb-list li").first()).toHaveText("Vô Địch — 98765 điểm (Khó) 🏆");
    await page.locator(".lb-tab", { hasText: "Khó" }).click();
    await expect(page.locator("#lb-list")).toContainText("Vô Địch");
    await page.locator(".lb-tab", { hasText: "Dễ" }).click();
    await expect(page.locator("#lb-list")).not.toContainText("Vô Địch");
    await page.getByRole("button", { name: "Về menu" }).click();
    await expect(menu(page)).toBeVisible();
  });

  test("gõ tên không làm nhân vật di chuyển (phím W/A/S/D)", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 50);
    await page.locator("#score-name").click();
    await page.keyboard.type("wasdg");
    await expect(page.locator("#score-name")).toHaveValue("wasdg");
    expect(await page.evaluate('!!(keysDown["w"] || keysDown["a"] || keysDown["s"] || keysDown["d"] || keysDown["g"])')).toBe(false);
  });

  test("điểm 0 thì không hiện form lưu điểm", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 0);
    await expect(scoreForm(page)).toBeHidden();
  });

  test("bấm Chơi lại thì ẩn form và chơi lại từ đầu", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 700);
    await expect(scoreForm(page)).toBeVisible();
    await page.getByRole("button", { name: "Chơi lại" }).click();
    await expect(overlay(page)).toBeHidden();
    await expect(scoreForm(page)).toBeHidden();
    expect(await page.evaluate("score")).toBe(0);
    expect(await page.evaluate("players[0].lives")).toBe(3);
  });

  test("nhớ tên người chơi cho lần sau", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 10);
    await submitScore(page, "Khởi");
    await page.reload();
    await startGame(page);
    await loseRun(page, 20);
    await expect(page.locator("#score-name")).toHaveValue("Khởi");
  });

  test("tên tối đa 20 ký tự và tên chứa mã HTML không chạy được", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 5);
    await page.locator("#score-name").fill("A".repeat(30));
    await expect(page.locator("#score-name")).toHaveValue("A".repeat(20));

    let dialog = false;
    page.on("dialog", (d) => { dialog = true; d.dismiss(); });
    await submitScore(page, "<img src=x onerror=alert(1)>".slice(0, 20));
    await page.getByRole("button", { name: "Về menu" }).click();
    await openLeaderboard(page);
    await expect(page.locator("#lb-list")).toContainText("<img src=x onerror=a");
    expect(await page.locator("#lb-list img").count()).toBe(0);
    expect(dialog).toBe(false);
  });

  test("máy chủ lỗi khi lưu: báo lỗi và cho bấm lưu lại", async ({ page }) => {
    await startGame(page);
    await loseRun(page, 400);
    await page.route("**/api/scores", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Lỗi máy chủ"}' })
        : route.continue()
    );
    await page.locator("#score-name").fill("Mạng Lỗi");
    await page.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(page.locator("#score-status")).toHaveText("Không lưu được: Lỗi máy chủ");
    await expect(page.getByRole("button", { name: "Lưu điểm" })).toBeEnabled();

    await page.unroute("**/api/scores");
    await page.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(page.locator("#score-status")).toHaveText("Đã lưu điểm!");
  });

  test("các nút của bảng xếp hạng nằm gọn trong khung game", async ({ page }) => {
    await openLeaderboard(page);
    const frame = await page.locator("#gameCanvas").boundingBox();
    for (const el of await page.locator("#screen-leaderboard button, #lb-list").all()) {
      const b = await el.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(frame.x);
      expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width);
    }
  });

  test("không tải được bảng xếp hạng thì hiện thông báo", async ({ page }) => {
    await page.route("**/api/scores*", (route) => route.abort());
    await page.getByRole("button", { name: "Bảng xếp hạng" }).click();
    await expect(page.locator("#lb-list")).toContainText("Không tải được bảng xếp hạng");
  });
});

// ---------- API thật trên server ----------
test.describe("API", () => {
  test("health check báo D1 hoạt động", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ status: "ok", db: true });
  });

  test("API từ chối dữ liệu gian lận", async ({ request }) => {
    for (const data of [
      { name: "Hack", score: 99_999_999 },
      { name: "Hack", score: -1 },
      { name: "", score: 10 },
      { name: "Hack", score: 10, difficulty: "god" },
    ]) {
      const res = await request.post("/api/scores", { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
  });
});
