// Bảng xếp hạng: gửi điểm khi hết lượt chơi và xem top điểm (dữ liệu lưu trên Cloudflare D1).
(function () {
  const DIFF_LABEL = { easy: "Dễ", normal: "Thường", hard: "Khó" };
  const NAME_KEY = "mario_player_name";

  const overlay = document.getElementById("overlay");
  const menu = document.getElementById("screen-menu");

  // --- Form gửi điểm trong overlay ---
  const form = document.createElement("form");
  form.id = "score-form";
  form.className = "hidden";
  form.innerHTML =
    '<input id="score-name" maxlength="20" placeholder="Tên của bạn" autocomplete="nickname" required>' +
    '<button type="submit" id="score-submit">Lưu điểm</button>' +
    '<p id="score-status"></p>';
  overlay.insertBefore(form, document.getElementById("restart-btn"));

  const nameInput = form.querySelector("#score-name");
  const submitBtn = form.querySelector("#score-submit");
  const statusEl = form.querySelector("#score-status");
  let pending = null;

  try { nameInput.value = localStorage.getItem(NAME_KEY) || ""; } catch {}

  // Không để phím gõ tên lọt vào điều khiển nhân vật
  nameInput.addEventListener("keydown", (e) => e.stopPropagation());
  nameInput.addEventListener("keyup", (e) => e.stopPropagation());

  window.onRunEnded = function (result) {
    if (!result || result.score <= 0) return;
    pending = result;
    statusEl.textContent = "";
    submitBtn.disabled = false;
    form.classList.remove("hidden");
  };

  // Ẩn form khi người chơi bấm Chơi lại / Về menu
  for (const id of ["restart-btn", "menu-btn"]) {
    document.getElementById(id).addEventListener("click", () => {
      pending = null;
      form.classList.add("hidden");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pending) return;
    const name = nameInput.value.trim();
    if (!name) return;
    submitBtn.disabled = true;
    statusEl.textContent = "Đang lưu...";
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, score: pending.score, difficulty: pending.difficulty, won: pending.won }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      statusEl.textContent = "Đã lưu điểm!";
      pending = null;
    } catch (err) {
      statusEl.textContent = "Không lưu được: " + err.message;
      submitBtn.disabled = false;
    }
  });

  // --- Màn hình bảng xếp hạng ---
  const screen = document.createElement("div");
  screen.id = "screen-leaderboard";
  screen.className = "screen hidden";
  screen.innerHTML =
    "<h2>Bảng xếp hạng</h2>" +
    '<div class="lb-tabs">' +
    '<button class="lb-tab" data-diff="">Tất cả</button>' +
    '<button class="lb-tab" data-diff="easy">Dễ</button>' +
    '<button class="lb-tab" data-diff="normal">Thường</button>' +
    '<button class="lb-tab" data-diff="hard">Khó</button>' +
    "</div>" +
    '<ol id="lb-list"></ol>' +
    '<button id="lb-back">Về menu</button>';
  menu.parentNode.insertBefore(screen, menu.nextSibling);

  const openBtn = document.createElement("button");
  openBtn.id = "btn-leaderboard";
  openBtn.textContent = "Bảng xếp hạng";
  menu.appendChild(openBtn);

  const list = screen.querySelector("#lb-list");

  async function load(difficulty) {
    screen.querySelectorAll(".lb-tab").forEach((b) => b.classList.toggle("selected", b.dataset.diff === difficulty));
    list.innerHTML = "<li>Đang tải...</li>";
    try {
      const q = difficulty ? "?difficulty=" + difficulty : "";
      const res = await fetch("/api/scores" + q);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      list.innerHTML = "";
      if (data.scores.length === 0) {
        list.innerHTML = "<li>Chưa có ai ghi điểm. Hãy là người đầu tiên!</li>";
        return;
      }
      for (const s of data.scores) {
        const li = document.createElement("li");
        li.textContent = s.name + " — " + s.score + " điểm (" + (DIFF_LABEL[s.difficulty] || s.difficulty) + ")" + (s.won ? " 🏆" : "");
        list.appendChild(li);
      }
    } catch (err) {
      list.innerHTML = "";
      const li = document.createElement("li");
      li.textContent = "Không tải được bảng xếp hạng: " + err.message;
      list.appendChild(li);
    }
  }

  openBtn.addEventListener("click", () => {
    menu.classList.add("hidden");
    screen.classList.remove("hidden");
    load("");
  });
  screen.querySelectorAll(".lb-tab").forEach((b) => b.addEventListener("click", () => load(b.dataset.diff)));
  screen.querySelector("#lb-back").addEventListener("click", () => {
    screen.classList.add("hidden");
    menu.classList.remove("hidden");
  });
})();
