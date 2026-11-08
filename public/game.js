const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");
const restartBtn = document.getElementById("restart-btn");
const menuBtn = document.getElementById("menu-btn");
const hint = document.getElementById("hint");

// ====================== HẰNG SỐ ======================
const TILE = 40;
const VIEW_WIDTH = 960, VIEW_HEIGHT = 540;
const ROWS = 13; // số hàng cố định cho màn ngang + trình tạo màn chơi
const GROUND_ROW = 12;
const TOWER_COLS = VIEW_WIDTH / TILE; // = 24, khớp khít bề ngang màn hình -> không cuộn ngang
const FLY_LIFT = 0.9;
const FLY_MAX_UP_SPEED = -4;
const FIRE_COOLDOWN = 350;
const FIREBALL_SPEED = 7;
const PIXEL_SCALE = 4;
const PLAYER_SIZES = [
  { width: 32, height: 48 },
  { width: 36, height: 64 },
  { width: 36, height: 64 }
];
const ENEMY_WIDTH = 32, ENEMY_HEIGHT = 32;
const BOSS_SIZE = 80;
const BOSS_HP_DEFAULT = 3;
const HIT_INVINCIBLE_MS = 1000;
const MOVING_PLATFORM_W = 80, MOVING_PLATFORM_H = 16;
const EDITOR_COLS = 100;

const DIFF_PRESETS = {
  easy: { gravity: 0.5, jump: -12.5, speed: 3.2, lives: 5 },
  normal: { gravity: 0.55, jump: -12, speed: 3.5, lives: 3 },
  hard: { gravity: 0.62, jump: -12, speed: 4.2, lives: 2 }
};

const CHARACTERS = [
  { id: "dad", name: "Bố", skill: "Cân bằng", shirt: "#d62828", overalls: "#2a6fdb", speedMult: 1, jumpMult: 1, floaty: false, shield: false, magnet: false, scale: 1 },
  { id: "mom", name: "Mẹ", skill: "Bay lượn, rơi chậm", shirt: "#e76f51", overalls: "#6a4c93", speedMult: 1, jumpMult: 1, floaty: true, shield: false, magnet: false, scale: 1 },
  { id: "son", name: "Con trai", skill: "Tốc độ cao", shirt: "#1d3557", overalls: "#2a9d8f", speedMult: 1.25, jumpMult: 1, floaty: false, shield: false, magnet: false, scale: 1 },
  { id: "daughter", name: "Con gái", skill: "Nhảy rất cao", shirt: "#e63946", overalls: "#e9c46a", speedMult: 1, jumpMult: 1.18, floaty: false, shield: false, magnet: false, scale: 1 },
  { id: "grandpa", name: "Ông", skill: "Khiên đỡ 1 lần", shirt: "#6c757d", overalls: "#222222", speedMult: 0.9, jumpMult: 1, floaty: false, shield: true, magnet: false, scale: 1 },
  { id: "baby", name: "Em bé", skill: "Nam châm hút xu, nhỏ con", shirt: "#2a9d8f", overalls: "#f4d35e", speedMult: 1, jumpMult: 1, floaty: false, shield: false, magnet: true, scale: 0.75 }
];

const STORAGE = {
  CUSTOM_LEVEL: "marioCustomLevel",
  CONTROLS1: "marioControls1",
  CONTROLS2: "marioControls2",
  DIFFICULTY: "marioDifficulty"
};

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ====================== TRẠNG THÁI ======================
let appState = "menu"; // menu | charselect | controls | difficulty | editor | playing
let gameState = "playing"; // playing | won | lost
let GRAVITY, JUMP_VELOCITY, MOVE_SPEED, LIVES_START;
let WORLD_WIDTH = 0, WORLD_HEIGHT = 0;
let score = 0;
let players = [];
let platforms, blocks, enemies, bosses, mushrooms, fireballs, coins, hazards, movingPlatforms, flag;
let camera = { x: 0, y: 0 };
let currentStageStart = { x: 50, y: 432 };
let runStages = [];
let stageIndex = 0;
let keysDown = {};
let rebindingAction = null;

let controls1 = loadJSON(STORAGE.CONTROLS1, { left: "a", right: "d", jump: "w", down: "s", fire: "g" });
let controls2 = loadJSON(STORAGE.CONTROLS2, { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", down: "ArrowDown", fire: "/" });
let difficultyKey = loadJSON(STORAGE.DIFFICULTY, "normal");

let selectedChar = { p1: CHARACTERS[0].id, p2: CHARACTERS[1].id };
let pendingLaunch = { mode: "stages", playerCount: 1 };

let editorGrid = null;
let editorCamera = { x: 0 };
let editorSelectedTile = 1;

function applyDifficulty() {
  const d = DIFF_PRESETS[difficultyKey] || DIFF_PRESETS.normal;
  GRAVITY = d.gravity;
  JUMP_VELOCITY = d.jump;
  MOVE_SPEED = d.speed;
  LIVES_START = d.lives;
}

// ====================== TILE ENGINE: LƯỚI -> ĐỐI TƯỢNG ======================
// Mã tile: 0 trống,1 đất,2 khối "?",4 ống nước(tường),5 quái,6 cờ đích,7 xu,8 xuất phát,
// 9 ống khói(sang/kết màn),10 trùm cuối,11 gai,12 bệ di chuyển ngang,13 bệ di chuyển dọc
function makeBlankGrid(cols) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) grid[GROUND_ROW][c] = 1;
  grid[GROUND_ROW - 1][1] = 8;
  return grid;
}

function buildStage1Grid() {
  const COLS = 125;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));

  const groundRanges = [[0, 9], [13, 45], [49, 85], [89, 124]];
  for (const [a, b] of groundRanges) for (let c = a; c <= b; c++) grid[GROUND_ROW][c] = 1;

  grid[GROUND_ROW - 1][1] = 8;
  for (const c of [6, 20, 33, 55, 65, 100]) grid[GROUND_ROW - 4][c] = 2;
  for (const c of [24, 70, 110]) { grid[GROUND_ROW - 1][c] = 4; grid[GROUND_ROW - 2][c] = 4; }
  for (const c of [17, 30, 40, 60, 80, 95, 105, 118]) grid[GROUND_ROW - 1][c] = 5;
  for (const c of [3, 4, 5]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [36, 37, 38, 39]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [72, 73, 74]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [92, 93, 94, 95, 96]) grid[GROUND_ROW - 3][c] = 7;

  grid[GROUND_ROW - 1][122] = 9;
  grid[GROUND_ROW - 2][122] = 9;

  return grid;
}

function buildStage2CaveGrid() {
  const COLS = 110;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));

  const groundRanges = [[0, 9], [13, 45], [51, 80], [84, 109]];
  for (const [a, b] of groundRanges) for (let c = a; c <= b; c++) grid[GROUND_ROW][c] = 1;

  grid[GROUND_ROW - 1][1] = 8;

  for (const c of [8, 60, 95]) grid[GROUND_ROW - 4][c] = 2;
  for (const c of [20, 65]) { grid[GROUND_ROW - 1][c] = 4; grid[GROUND_ROW - 2][c] = 4; }

  // hố rộng 46-50 (200px) không nhảy qua được bằng chân -> buộc dùng bệ di chuyển
  grid[GROUND_ROW - 2][48] = 12;

  for (const c of [18, 28, 38, 55, 68, 78, 90, 100]) grid[GROUND_ROW - 1][c] = 5;

  for (const c of [15, 53]) grid[GROUND_ROW - 1][c] = 11;
  for (const c of [98]) grid[GROUND_ROW - 1][c] = 11;

  for (const c of [4, 5, 6]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [62, 63, 64]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [103, 104, 105]) grid[GROUND_ROW - 3][c] = 7;

  grid[GROUND_ROW - 1][106] = 9;
  grid[GROUND_ROW - 2][106] = 9;

  return grid;
}

function buildStage3TowerGrid() {
  const COLS = TOWER_COLS;
  const TOTAL_ROWS = 64;
  const grid = [];
  for (let r = 0; r < TOTAL_ROWS; r++) grid.push(new Array(COLS).fill(0));

  for (let r = 0; r < TOTAL_ROWS; r++) {
    grid[r][0] = 1;
    grid[r][COLS - 1] = 1;
  }

  for (let c = 1; c < COLS - 1; c++) grid[TOTAL_ROWS - 1][c] = 1;
  grid[TOTAL_ROWS - 2][2] = 8;

  const platformLen = 4;
  let row = TOTAL_ROWS - 3;
  let col = 2;
  let dir = 1;
  let step = 0;

  while (row > 4) {
    for (let c = 0; c < platformLen; c++) {
      if (col + c < COLS - 1) grid[row][col + c] = 1;
    }
    if (step % 4 === 2) grid[row - 1][col + 1] = 11;
    else if (step % 4 === 3 && row > 15 && row < TOTAL_ROWS - 6) grid[row - 1][col + (dir > 0 ? platformLen - 1 : 0)] = 5;

    col += dir * 2;
    if (col > COLS - 2 - platformLen) { col = COLS - 2 - platformLen; dir = -1; }
    if (col < 1) { col = 1; dir = 1; }
    row -= 2;
    step++;
  }

  // Hai bệ di chuyển dọc nối những quãng xa giữa tháp
  grid[Math.floor(TOTAL_ROWS * 0.6)][Math.floor(COLS / 2)] = 13;
  grid[Math.floor(TOTAL_ROWS * 0.3)][Math.floor(COLS / 2)] = 13;

  // sàn đáp gần đỉnh + ống khói lên màn kế
  const topRow = 3;
  for (let c = Math.floor(COLS / 2) - 3; c <= Math.floor(COLS / 2) + 3; c++) grid[topRow][c] = 1;
  grid[topRow - 1][Math.floor(COLS / 2)] = 9;
  grid[topRow - 2][Math.floor(COLS / 2)] = 9;

  return grid;
}

function buildStage4Grid() {
  const COLS = 70;
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));

  const groundRanges = [[0, 15], [19, 45], [49, 69]];
  for (const [a, b] of groundRanges) for (let c = a; c <= b; c++) grid[GROUND_ROW][c] = 1;

  grid[GROUND_ROW - 1][1] = 8;
  for (const c of [5, 30, 55]) grid[GROUND_ROW - 4][c] = 2;
  for (const c of [12, 35]) { grid[GROUND_ROW - 1][c] = 4; grid[GROUND_ROW - 2][c] = 4; }
  for (const c of [10, 22, 28, 38, 52]) grid[GROUND_ROW - 1][c] = 5;
  for (const c of [20, 50]) grid[GROUND_ROW - 1][c] = 11;
  for (const c of [7, 8, 9]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [32, 33, 34]) grid[GROUND_ROW - 3][c] = 7;
  for (const c of [58, 59]) grid[GROUND_ROW - 3][c] = 7;

  grid[GROUND_ROW - 1][64] = 10;
  grid[GROUND_ROW - 1][68] = 6;

  return grid;
}

function buildEntitiesFromGrid(grid, enemySpeed, bossHp) {
  enemySpeed = enemySpeed || 1;
  bossHp = bossHp || BOSS_HP_DEFAULT;
  const platformsOut = [], blocksOut = [], enemiesOut = [], coinsOut = [], bossesOut = [], hazardsOut = [], movingOut = [];
  let flagTile = null, startTile = null;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const code = grid[row][col];
      if (!code) continue;
      const x = col * TILE, y = row * TILE;
      if (code === 1) platformsOut.push({ x, y, width: TILE, height: TILE, pipe: false, warp: false });
      else if (code === 4) platformsOut.push({ x, y, width: TILE, height: TILE, pipe: true, warp: false });
      else if (code === 9) platformsOut.push({ x, y, width: TILE, height: TILE, pipe: true, warp: true });
      else if (code === 2) blocksOut.push({ x, y, width: TILE, height: TILE, hasMushroom: true });
      else if (code === 5) enemiesOut.push({
        x, y: y + TILE - ENEMY_HEIGHT, width: ENEMY_WIDTH, height: ENEMY_HEIGHT,
        minX: x - 80, maxX: x + 80, vx: enemySpeed, type: enemiesOut.length % 2 === 0 ? "goomba" : "koopa"
      });
      else if (code === 10) bossesOut.push({
        x, y: y + TILE - BOSS_SIZE, width: BOSS_SIZE, height: BOSS_SIZE,
        minX: x - 150, maxX: x + 150, vx: 1.2, hp: bossHp, maxHp: bossHp
      });
      else if (code === 7) coinsOut.push({ x: x + TILE / 2 - 10, y: y + TILE / 2 - 10, width: 20, height: 20 });
      else if (code === 6) flagTile = { x, y };
      else if (code === 8) startTile = { x, y };
      else if (code === 11) hazardsOut.push({ x, y: y + TILE - 16, width: TILE, height: 16 });
      else if (code === 12) movingOut.push({
        x, y, width: MOVING_PLATFORM_W, height: MOVING_PLATFORM_H,
        baseX: x, baseY: y, axis: "x", freq: 0.6, amplitude: 2 * TILE
      });
      else if (code === 13) movingOut.push({
        x, y, width: MOVING_PLATFORM_W, height: MOVING_PLATFORM_H,
        baseX: x, baseY: y, axis: "y", freq: 0.5, amplitude: 3 * TILE
      });
    }
  }

  const worldWidth = grid[0].length * TILE;
  const worldHeight = grid.length * TILE;
  const flagRect = flagTile ? { x: flagTile.x + TILE / 2 - 10, y: flagTile.y + TILE - 150, width: 20, height: 150 } : null;
  const start = startTile
    ? { x: startTile.x, y: startTile.y + TILE - PLAYER_SIZES[0].height }
    : { x: 50, y: GROUND_ROW * TILE - PLAYER_SIZES[0].height };

  return {
    platforms: platformsOut, blocks: blocksOut, enemiesStart: enemiesOut, coinsStart: coinsOut,
    bossesStart: bossesOut, hazardsStart: hazardsOut, movingStart: movingOut,
    flag: flagRect, start, worldWidth, worldHeight
  };
}

// ====================== SPRITE PIXEL ART (vẽ nhỏ rồi phóng to) ======================
function R(v) { return Math.round(v) || 1; }

function createPlayerSprite(fullWidth, fullHeight, shirtColor, overallsColor) {
  const width = Math.max(8, Math.round(fullWidth / PIXEL_SCALE));
  const height = Math.max(12, Math.round(fullHeight / PIXEL_SCALE));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = width;
  spriteCanvas.height = height;
  const c = spriteCanvas.getContext("2d");

  c.fillStyle = shirtColor;
  c.fillRect(R(width * 0.12), 0, R(width * 0.76), R(height * 0.2));
  c.fillRect(R(width * 0.05), R(height * 0.16), R(width * 0.9), R(height * 0.06));

  c.fillStyle = "#f4c28c";
  c.fillRect(R(width * 0.18), R(height * 0.2), R(width * 0.64), R(height * 0.18));

  c.fillStyle = "#222";
  c.fillRect(R(width * 0.3), R(height * 0.26), R(width * 0.1), R(width * 0.1));
  c.fillRect(R(width * 0.58), R(height * 0.26), R(width * 0.1), R(width * 0.1));

  c.fillStyle = "#4a2c0f";
  c.fillRect(R(width * 0.22), R(height * 0.34), R(width * 0.56), R(height * 0.06));

  c.fillStyle = shirtColor;
  c.fillRect(0, R(height * 0.4), width, R(height * 0.14));

  c.fillStyle = overallsColor;
  c.fillRect(R(width * 0.12), R(height * 0.46), R(width * 0.76), R(height * 0.42));
  c.fillStyle = "#f4d35e";
  c.fillRect(R(width * 0.26), R(height * 0.5), R(width * 0.1), R(width * 0.1));
  c.fillRect(R(width * 0.64), R(height * 0.5), R(width * 0.1), R(width * 0.1));

  c.fillStyle = "#fff";
  c.fillRect(0, R(height * 0.46), R(width * 0.14), R(width * 0.14));
  c.fillRect(R(width * 0.86), R(height * 0.46), R(width * 0.14), R(width * 0.14));

  c.fillStyle = "#4a2c0f";
  c.fillRect(R(width * 0.1), R(height * 0.88), R(width * 0.3), R(height * 0.12));
  c.fillRect(R(width * 0.6), R(height * 0.88), R(width * 0.3), R(height * 0.12));

  return spriteCanvas;
}

function createEnemySprite(fullWidth, fullHeight, bodyColor) {
  const width = Math.max(8, Math.round(fullWidth / PIXEL_SCALE));
  const height = Math.max(8, Math.round(fullHeight / PIXEL_SCALE));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = width;
  spriteCanvas.height = height;
  const c = spriteCanvas.getContext("2d");

  c.fillStyle = bodyColor;
  c.beginPath();
  c.moveTo(0, height);
  c.lineTo(0, height * 0.5);
  c.quadraticCurveTo(0, height * 0.1, width / 2, height * 0.1);
  c.quadraticCurveTo(width, height * 0.1, width, height * 0.5);
  c.lineTo(width, height);
  c.closePath();
  c.fill();

  c.fillStyle = "#2b1d0e";
  c.fillRect(R(width * 0.08), R(height * 0.85), R(width * 0.3), R(height * 0.15));
  c.fillRect(R(width * 0.62), R(height * 0.85), R(width * 0.3), R(height * 0.15));

  c.fillStyle = "#fff";
  c.fillRect(R(width * 0.22), R(height * 0.45), R(width * 0.2), R(height * 0.2));
  c.fillRect(R(width * 0.58), R(height * 0.45), R(width * 0.2), R(height * 0.2));
  c.fillStyle = "#222";
  c.fillRect(R(width * 0.28), R(height * 0.5), R(width * 0.1), R(height * 0.1));
  c.fillRect(R(width * 0.64), R(height * 0.5), R(width * 0.1), R(height * 0.1));

  return spriteCanvas;
}

function createBossSprite(fullWidth, fullHeight) {
  const width = Math.max(10, Math.round(fullWidth / PIXEL_SCALE));
  const height = Math.max(10, Math.round(fullHeight / PIXEL_SCALE));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = width;
  spriteCanvas.height = height;
  const c = spriteCanvas.getContext("2d");

  c.fillStyle = "#5c2a9d";
  c.fillRect(R(width * 0.1), R(height * 0.2), R(width * 0.8), R(height * 0.8));

  c.fillStyle = "#2b1d0e";
  c.fillRect(R(width * 0.15), 0, R(width * 0.12), R(height * 0.22));
  c.fillRect(R(width * 0.73), 0, R(width * 0.12), R(height * 0.22));

  c.fillStyle = "#fff";
  c.fillRect(R(width * 0.2), R(height * 0.35), R(width * 0.18), R(height * 0.18));
  c.fillRect(R(width * 0.62), R(height * 0.35), R(width * 0.18), R(height * 0.18));
  c.fillStyle = "#e63946";
  c.fillRect(R(width * 0.26), R(height * 0.4), R(width * 0.08), R(height * 0.08));
  c.fillRect(R(width * 0.68), R(height * 0.4), R(width * 0.08), R(height * 0.08));

  c.fillStyle = "#2b1d0e";
  c.fillRect(R(width * 0.15), R(height * 0.85), R(width * 0.25), R(height * 0.15));
  c.fillRect(R(width * 0.6), R(height * 0.85), R(width * 0.25), R(height * 0.15));

  return spriteCanvas;
}

function createMushroomSprite(fullSize) {
  const size = Math.max(6, Math.round(fullSize / PIXEL_SCALE));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = size;
  spriteCanvas.height = size;
  const c = spriteCanvas.getContext("2d");
  c.fillStyle = "#f1faee";
  c.fillRect(R(size * 0.3), R(size * 0.5), R(size * 0.4), R(size * 0.5));
  c.fillStyle = "#e63946";
  c.beginPath();
  c.arc(size / 2, size * 0.45, size * 0.45, Math.PI, 0);
  c.fill();
  c.fillStyle = "#fff";
  c.fillRect(R(size * 0.22), R(size * 0.3), R(size * 0.12), R(size * 0.12));
  c.fillRect(R(size * 0.62), R(size * 0.3), R(size * 0.12), R(size * 0.12));
  return spriteCanvas;
}

function createCoinSprite(fullSize) {
  const size = Math.max(6, Math.round(fullSize / PIXEL_SCALE));
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = size;
  spriteCanvas.height = size;
  const c = spriteCanvas.getContext("2d");
  c.fillStyle = "#ffd60a";
  c.fillRect(R(size * 0.2), 0, R(size * 0.6), size);
  c.fillStyle = "#e0a800";
  c.fillRect(R(size * 0.35), R(size * 0.15), R(size * 0.3), R(size * 0.7));
  return spriteCanvas;
}

const flagSprite = createFlagSprite();
function createFlagSprite() {
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 20;
  spriteCanvas.height = 150;
  const fctx = spriteCanvas.getContext("2d");
  fctx.fillStyle = "#8b5a2b";
  fctx.fillRect(8, 0, 4, 150);
  fctx.fillStyle = "#e63946";
  fctx.fillRect(12, 4, 8, 44);
  return spriteCanvas;
}

const mushroomSprite = createMushroomSprite(28);
const coinSprite = createCoinSprite(20);

// ====================== TRÒ CHƠI: VẬT LÝ / LOGIC ======================
function solids() {
  return platforms.concat(blocks).concat(movingPlatforms);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

function growPlayer(p, newLevel) {
  if (newLevel === p.power) return;
  const size = PLAYER_SIZES[newLevel];
  const scale = p.character.scale || 1;
  const w = Math.round(size.width * scale), h = Math.round(size.height * scale);
  const oldBottom = p.y + p.height;
  p.width = w;
  p.height = h;
  p.y = oldBottom - p.height;
  p.power = newLevel;
  p.sprite = createPlayerSprite(p.width, p.height, p.character.shirt, newLevel >= 2 ? "#f1faee" : p.character.overalls);
}

function tryShoot(p) {
  const now = performance.now();
  if (now - p.lastShotTime < FIRE_COOLDOWN) return;
  p.lastShotTime = now;
  fireballs.push({
    x: p.facing === 1 ? p.x + p.width : p.x - 14,
    y: p.y + p.height * 0.4,
    width: 14, height: 14,
    vx: FIREBALL_SPEED * p.facing
  });
}

function bumpBlock(block) {
  if (block.used) return;
  block.used = true;
  if (block.hasMushroom) {
    mushrooms.push({ x: block.x + block.width / 2 - 14, y: block.y - 28, width: 28, height: 28, vx: 1.2, vy: -3 });
  }
}

function damagePlayer(p) {
  const now = performance.now();
  if (now < (p.invincibleUntil || 0)) return;
  if (p.shieldReady) {
    p.shieldReady = false;
    p.invincibleUntil = now + HIT_INVINCIBLE_MS;
    return;
  }
  handlePlayerDeath(p);
}

function handlePlayerDeath(p) {
  if (!p.alive) return;
  const now = performance.now();
  if (now < (p.invincibleUntil || 0)) return;
  p.invincibleUntil = now + HIT_INVINCIBLE_MS;
  p.lives--;
  if (p.lives <= 0) {
    p.alive = false;
    if (players.every(pl => !pl.alive)) {
      gameState = "lost";
      restartBtn.textContent = "Chơi lại";
      showOverlay("Thua rồi! Điểm: " + score);
      notifyRunEnded(false);
    }
  } else if (players.length === 1) {
    gameState = "lost";
    restartBtn.textContent = "Tiếp tục";
    showOverlay("Mất 1 mạng! Còn " + p.lives + " mạng.");
  } else {
    respawnPlayerAtStageStart(p);
  }
}

function respawnPlayerAtStageStart(p) {
  const baseSize = PLAYER_SIZES[0];
  const scale = p.character.scale || 1;
  p.width = Math.round(baseSize.width * scale);
  p.height = Math.round(baseSize.height * scale);
  p.x = currentStageStart.x;
  p.y = currentStageStart.y + (baseSize.height - p.height);
  p.vx = 0; p.vy = 0; p.onGround = false; p.power = 0; p.facing = 1;
  p.sprite = createPlayerSprite(p.width, p.height, p.character.shirt, p.character.overalls);
  p.shieldReady = !!p.character.shield;
  p.standingOnMoving = null;
}

function triggerWarp() {
  if (stageIndex < runStages.length - 1) {
    stageIndex++;
    spawnStage(runStages[stageIndex]);
  } else {
    winRun();
  }
}

function winRun() {
  if (gameState !== "playing") return;
  gameState = "won";
  restartBtn.textContent = "Chơi lại";
  showOverlay("Chúc mừng, đã qua hết các màn! Điểm: " + score);
  notifyRunEnded(true);
}

function updatePlayerPhysics(p) {
  p.standingOnMoving = null;
  const speed = MOVE_SPEED * (p.character.speedMult || 1);
  const jumpV = JUMP_VELOCITY * (p.character.jumpMult || 1);

  p.vx = 0;
  if (keysDown[p.controls.left]) { p.vx = -speed; p.facing = -1; }
  if (keysDown[p.controls.right]) { p.vx = speed; p.facing = 1; }

  const jumpKey = keysDown[p.controls.jump];
  if (jumpKey && p.onGround) {
    p.vy = jumpV;
    p.onGround = false;
  } else if (jumpKey && !p.onGround && p.power >= 2) {
    p.vy = Math.max(p.vy - FLY_LIFT, FLY_MAX_UP_SPEED);
  }

  if (keysDown[p.controls.fire] && p.power >= 2) tryShoot(p);

  let g = GRAVITY;
  if (p.character.floaty && p.vy > 0 && jumpKey) g *= 0.45;
  p.vy += g;

  p.x += p.vx;
  p.x = Math.max(0, Math.min(p.x, WORLD_WIDTH - p.width));
  // Chỉ ống nước/tường mới chặn ngang - đất/bậc thang thường không chặn hông,
  // để nhảy sát cạnh các bậc thang trong tháp không bị "đụng hông" vô lý.
  for (const platform of platforms) {
    if (platform.pipe && p.vx !== 0 && rectsOverlap(p, platform)) {
      if (p.vx > 0) p.x = platform.x - p.width;
      else p.x = platform.x + platform.width;
    }
  }

  const prevBottom = p.y + p.height;
  const prevTop = p.y;
  p.y += p.vy;
  p.onGround = false;

  for (const solid of solids()) {
    if (p.vy >= 0 && rectsOverlap(p, solid) && prevBottom <= solid.y + 1) {
      p.y = solid.y - p.height;
      p.vy = 0;
      p.onGround = true;
      if (movingPlatforms.includes(solid)) p.standingOnMoving = solid;
    }
  }
  for (const block of blocks) {
    if (p.vy < 0 && rectsOverlap(p, block) && prevTop >= block.y + block.height - 1) {
      p.y = block.y + block.height;
      p.vy = 0;
      bumpBlock(block);
    }
  }

  p.prevBottom = prevBottom;

  if (p.y > WORLD_HEIGHT) { handlePlayerDeath(p); return; }

  for (const hz of hazards) {
    if (rectsOverlap(p, hz)) damagePlayer(p);
  }
  if (!p.alive) return;

  if (p.character.magnet) {
    for (const coin of coins) {
      const dx = (p.x + p.width / 2) - (coin.x + coin.width / 2);
      const dy = (p.y + p.height / 2) - (coin.y + coin.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 100 && dist > 1) {
        coin.x += (dx / dist) * 4;
        coin.y += (dy / dist) * 4;
      }
    }
  }

  if (keysDown[p.controls.down]) {
    for (const solid of platforms) {
      if (solid.warp && rectsOverlap(p, solid)) { triggerWarp(); break; }
    }
  }
}

function updateMovingPlatforms() {
  const t = performance.now() / 1000;
  for (const mp of movingPlatforms) {
    const oldX = mp.x, oldY = mp.y;
    if (mp.axis === "x") mp.x = mp.baseX + Math.sin(t * mp.freq) * mp.amplitude;
    else mp.y = mp.baseY + Math.sin(t * mp.freq) * mp.amplitude;
    const dx = mp.x - oldX, dy = mp.y - oldY;
    if (dx === 0 && dy === 0) continue;
    for (const p of players) {
      if (p.alive && p.standingOnMoving === mp) { p.x += dx; p.y += dy; }
    }
  }
}

function updateEnemies() {
  for (const enemy of enemies) {
    enemy.x += enemy.vx;
    if (enemy.x < enemy.minX || enemy.x + enemy.width > enemy.maxX) enemy.vx *= -1;
  }
  for (const enemy of enemies) {
    for (const p of players) {
      if (!p.alive || !rectsOverlap(p, enemy)) continue;
      if (p.vy >= 0 && p.prevBottom <= enemy.y + 10) {
        enemy.dead = true;
        p.vy = JUMP_VELOCITY * 0.5;
        score += 100;
      } else {
        damagePlayer(p);
      }
    }
  }
  enemies = enemies.filter(e => !e.dead);
}

function updateBosses() {
  const now = performance.now();
  for (const boss of bosses) {
    boss.x += boss.vx;
    if (boss.x < boss.minX || boss.x + boss.width > boss.maxX) boss.vx *= -1;
  }
  for (const boss of bosses) {
    for (const p of players) {
      if (!p.alive || !rectsOverlap(p, boss)) continue;
      if (p.vy >= 0 && p.prevBottom <= boss.y + 16) {
        if (now >= (boss.invincibleUntil || 0)) {
          boss.hp--;
          boss.invincibleUntil = now + 500;
          score += 50;
        }
        p.vy = JUMP_VELOCITY * 0.5;
      } else {
        damagePlayer(p);
      }
    }
  }
  bosses = bosses.filter(b => {
    if (b.hp <= 0) { score += 500; return false; }
    return true;
  });
}

function updateMushrooms() {
  for (const m of mushrooms) {
    m.vy += GRAVITY;
    m.x += m.vx;
    m.y += m.vy;
    for (const s of solids()) {
      if (m.vy >= 0 && rectsOverlap(m, s)) {
        const prevB = m.y - m.vy + m.height;
        if (prevB <= s.y + 1) { m.y = s.y - m.height; m.vy = 0; }
      }
    }
  }
  for (const m of mushrooms) {
    for (const p of players) {
      if (p.alive && !m.collected && rectsOverlap(p, m)) {
        m.collected = true;
        growPlayer(p, Math.min(p.power + 1, 2));
        score += 50;
      }
    }
  }
  mushrooms = mushrooms.filter(m => !m.collected);
}

function updateFireballs() {
  for (const fb of fireballs) fb.x += fb.vx;
  for (const fb of fireballs) {
    for (const enemy of enemies) {
      if (!fb.dead && rectsOverlap(fb, enemy)) { enemy.dead = true; fb.dead = true; score += 100; }
    }
    for (const boss of bosses) {
      if (!fb.dead && rectsOverlap(fb, boss)) { boss.hp--; fb.dead = true; score += 50; }
    }
  }
  enemies = enemies.filter(e => !e.dead);
  bosses = bosses.filter(b => {
    if (b.hp <= 0) { score += 500; return false; }
    return true;
  });
  fireballs = fireballs.filter(fb => !fb.dead && fb.x > camera.x - 50 && fb.x < camera.x + VIEW_WIDTH + 50);
}

function updateCoins() {
  for (const coin of coins) {
    for (const p of players) {
      if (p.alive && !coin.collected && rectsOverlap(p, coin)) { coin.collected = true; score += 10; }
    }
  }
  coins = coins.filter(c => !c.collected);
}

function updateCamera() {
  const alive = players.filter(p => p.alive);
  if (alive.length === 0) return;
  const avgX = alive.reduce((s, p) => s + p.x + p.width / 2, 0) / alive.length;
  const avgY = alive.reduce((s, p) => s + p.y + p.height / 2, 0) / alive.length;
  camera.x = Math.max(0, Math.min(avgX - VIEW_WIDTH / 2, Math.max(0, WORLD_WIDTH - VIEW_WIDTH)));
  camera.y = Math.max(0, Math.min(avgY - VIEW_HEIGHT / 2, Math.max(0, WORLD_HEIGHT - VIEW_HEIGHT)));
}

// Báo cho leaderboard.js biết lượt chơi đã kết thúc để gửi điểm lên bảng xếp hạng
function notifyRunEnded(won) {
  if (typeof window.onRunEnded === "function") {
    window.onRunEnded({ score, won, difficulty: difficultyKey, players: players.length });
  }
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function update() {
  if (gameState !== "playing") return;
  updateMovingPlatforms();
  for (const p of players) if (p.alive) updatePlayerPhysics(p);
  updateEnemies();
  updateBosses();
  updateMushrooms();
  updateFireballs();
  updateCoins();
  updateCamera();
  if (flag && gameState === "playing") {
    for (const p of players) {
      if (p.alive && rectsOverlap(p, flag)) { winRun(); break; }
    }
  }
}

function toScreenX(worldX, parallax) {
  return worldX - camera.x * (parallax === undefined ? 1 : parallax);
}
function toScreenY(worldY, parallax) {
  return worldY - camera.y * (parallax === undefined ? 1 : parallax);
}

// ====================== CẢNH VẬT NỀN (chỉ màn ngang) ======================
const clouds = [
  { x: 150, y: 70 }, { x: 700, y: 50 }, { x: 1400, y: 90 }, { x: 2200, y: 60 },
  { x: 3000, y: 80 }, { x: 3800, y: 55 }, { x: 4500, y: 95 }
];
const hills = [{ x: 300 }, { x: 1200 }, { x: 2600 }, { x: 3900 }, { x: 4700 }];
const bushes = [{ x: 550 }, { x: 1600 }, { x: 2800 }, { x: 4100 }, { x: 4800 }];

function drawCastle(screenX) {
  const baseY = toScreenY(GROUND_ROW * TILE);
  ctx.fillStyle = "#9a8c98";
  ctx.fillRect(screenX, baseY - 120, 160, 120);
  ctx.fillRect(screenX - 10, baseY - 160, 30, 160);
  ctx.fillRect(screenX + 140, baseY - 160, 30, 160);
  ctx.fillStyle = "#6c6570";
  for (let i = 0; i < 5; i++) ctx.fillRect(screenX + i * 32, baseY - 128, 16, 10);
  ctx.fillStyle = "#3d2b1f";
  ctx.fillRect(screenX + 65, baseY - 50, 30, 50);
}

function isVerticalStage() {
  return WORLD_HEIGHT > VIEW_HEIGHT && WORLD_WIDTH <= VIEW_WIDTH;
}

function drawGame() {
  const vertical = isVerticalStage();
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  if (vertical) {
    sky.addColorStop(0, "#1b1035");
    sky.addColorStop(1, "#3a2a5c");
  } else {
    sky.addColorStop(0, "#5c94fc");
    sky.addColorStop(1, "#cdeefd");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  if (!vertical) {
    ctx.fillStyle = "#ffffff";
    for (const cl of clouds) {
      const sx = toScreenX(cl.x, 0.3);
      if (sx < -80 || sx > VIEW_WIDTH + 80) continue;
      ctx.beginPath();
      ctx.arc(sx, cl.y, 22, 0, Math.PI * 2);
      ctx.arc(sx + 24, cl.y + 6, 18, 0, Math.PI * 2);
      ctx.arc(sx - 24, cl.y + 6, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#9fd896";
    for (const h of hills) {
      const sx = toScreenX(h.x, 0.5);
      if (sx < -140 || sx > VIEW_WIDTH + 140) continue;
      ctx.beginPath();
      ctx.arc(sx, toScreenY(GROUND_ROW * TILE), 110, Math.PI, 0);
      ctx.fill();
    }

    ctx.fillStyle = "#4e9e4e";
    for (const b of bushes) {
      const sx = toScreenX(b.x, 0.8);
      if (sx < -60 || sx > VIEW_WIDTH + 60) continue;
      ctx.beginPath();
      ctx.arc(sx, toScreenY(GROUND_ROW * TILE), 20, Math.PI, 0);
      ctx.arc(sx + 22, toScreenY(GROUND_ROW * TILE), 16, Math.PI, 0);
      ctx.arc(sx - 22, toScreenY(GROUND_ROW * TILE), 16, Math.PI, 0);
      ctx.fill();
    }

    if (flag) drawCastle(toScreenX(flag.x + 30));
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 20; i++) {
      const wy = (i * 137) % WORLD_HEIGHT;
      const sy = toScreenY(wy);
      if (sy < -10 || sy > VIEW_HEIGHT + 10) continue;
      ctx.fillRect(0, sy, VIEW_WIDTH, 2);
    }
  }

  for (const platform of platforms) {
    const sx = toScreenX(platform.x), sy = toScreenY(platform.y);
    if (sx < -TILE || sx > VIEW_WIDTH || sy < -TILE || sy > VIEW_HEIGHT) continue;
    ctx.fillStyle = platform.pipe ? (platform.warp ? "#3aa63a" : "#2e8b2e") : (vertical ? "#5c4a7a" : "#5a3921");
    ctx.fillRect(sx, sy, platform.width, platform.height);
    if (platform.pipe) {
      ctx.fillStyle = platform.warp ? "#fff" : "#1f6b1f";
      ctx.fillRect(sx, sy, platform.width, 6);
    }
  }

  for (const mp of movingPlatforms) {
    ctx.fillStyle = "#e07a5f";
    ctx.fillRect(toScreenX(mp.x), toScreenY(mp.y), mp.width, mp.height);
  }

  ctx.fillStyle = "#c81d25";
  for (const hz of hazards) {
    const sx = toScreenX(hz.x), sy = toScreenY(hz.y);
    const spikeCount = Math.floor(hz.width / 10);
    for (let i = 0; i < spikeCount; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + i * 10, sy + hz.height);
      ctx.lineTo(sx + i * 10 + 5, sy);
      ctx.lineTo(sx + i * 10 + 10, sy + hz.height);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  for (const block of blocks) {
    const sx = toScreenX(block.x), sy = toScreenY(block.y);
    ctx.fillStyle = block.used ? "#8a6d3b" : "#f2a541";
    ctx.fillRect(sx, sy, block.width, block.height);
    if (!block.used) {
      ctx.fillStyle = "#fff";
      ctx.fillText("?", sx + block.width / 2, sy + block.height * 0.7);
    }
  }

  for (const coin of coins) ctx.drawImage(coinSprite, toScreenX(coin.x), toScreenY(coin.y), coin.width, coin.height);

  if (flag) ctx.drawImage(flagSprite, toScreenX(flag.x), toScreenY(flag.y), flag.width, flag.height);

  for (const m of mushrooms) ctx.drawImage(mushroomSprite, toScreenX(m.x), toScreenY(m.y), m.width, m.height);

  ctx.fillStyle = "#ff6b35";
  for (const fb of fireballs) {
    ctx.beginPath();
    ctx.arc(toScreenX(fb.x) + fb.width / 2, toScreenY(fb.y) + fb.height / 2, fb.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const enemy of enemies) ctx.drawImage(enemy.sprite, toScreenX(enemy.x), toScreenY(enemy.y), enemy.width, enemy.height);

  for (const boss of bosses) {
    ctx.drawImage(boss.sprite, toScreenX(boss.x), toScreenY(boss.y), boss.width, boss.height);
    const barW = boss.width;
    ctx.fillStyle = "#333";
    ctx.fillRect(toScreenX(boss.x), toScreenY(boss.y) - 14, barW, 8);
    ctx.fillStyle = "#e63946";
    ctx.fillRect(toScreenX(boss.x), toScreenY(boss.y) - 14, barW * (boss.hp / boss.maxHp), 8);
  }

  const now = performance.now();
  for (const p of players) {
    if (!p.alive) continue;
    const blinking = now < (p.invincibleUntil || 0) && Math.floor(now / 100) % 2 === 0;
    if (blinking) continue;
    if (p.shieldReady) {
      ctx.strokeStyle = "#ffd60a";
      ctx.lineWidth = 3;
      ctx.strokeRect(toScreenX(p.x) - 2, toScreenY(p.y) - 2, p.width + 4, p.height + 4);
    }
    ctx.drawImage(p.sprite, toScreenX(p.x), toScreenY(p.y), p.width, p.height);
  }

  ctx.textAlign = "left";
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#fff";
  let hudY = 24;
  ctx.fillText("Điểm: " + score + "   Màn: " + (stageIndex + 1) + "/" + runStages.length, 12, hudY);
  for (const p of players) {
    hudY += 20;
    const powerLabel = ["Nhỏ", "Lớn", "Lớn+Bay+Lửa"][p.power];
    const status = p.alive ? ("Mạng: " + p.lives + "  Sức mạnh: " + powerLabel) : "ĐÃ THUA";
    ctx.fillText("P" + p.id + " (" + p.character.name + "): " + status, 12, hudY);
  }
}

// ====================== VÀO MÀN / RESPAWN ======================
function spawnStage(stage) {
  const grid = stage.grid;
  const data = buildEntitiesFromGrid(grid, stage.enemySpeed, stage.bossHp);
  WORLD_WIDTH = data.worldWidth;
  WORLD_HEIGHT = Math.max(data.worldHeight, VIEW_HEIGHT);
  platforms = data.platforms;
  blocks = data.blocks.map(b => ({ ...b, used: false }));
  enemies = data.enemiesStart.map(e => ({
    ...e, dead: false,
    sprite: createEnemySprite(ENEMY_WIDTH, ENEMY_HEIGHT, e.type === "koopa" ? "#4e9e4e" : "#8d5524")
  }));
  bosses = data.bossesStart.map(b => ({ ...b, sprite: createBossSprite(BOSS_SIZE, BOSS_SIZE), invincibleUntil: 0 }));
  coins = data.coinsStart.map(c => ({ ...c, collected: false }));
  hazards = data.hazardsStart;
  movingPlatforms = data.movingStart.map(m => ({ ...m }));
  mushrooms = [];
  fireballs = [];
  flag = data.flag;
  currentStageStart = data.start;

  players.forEach((p, i) => {
    const baseSize = PLAYER_SIZES[0];
    const scale = p.character.scale || 1;
    p.width = Math.round(baseSize.width * scale);
    p.height = Math.round(baseSize.height * scale);
    p.x = data.start.x + (i === 0 ? 0 : -50);
    p.y = data.start.y + (baseSize.height - p.height);
    p.vx = 0; p.vy = 0; p.onGround = false; p.facing = 1; p.power = 0; p.lastShotTime = -Infinity;
    p.sprite = createPlayerSprite(p.width, p.height, p.character.shirt, p.character.overalls);
    p.shieldReady = !!p.character.shield;
    p.standingOnMoving = null;
    p.invincibleUntil = 0;
  });
  camera = { x: 0, y: 0 };
  gameState = "playing";
}

function makePlayer(character, id) {
  return { id, character, controls: id === 1 ? controls1 : controls2, lives: LIVES_START, alive: true, power: 0, facing: 1 };
}

function startRun(stages, chars) {
  runStages = stages;
  stageIndex = 0;
  applyDifficulty();
  score = 0;
  players = chars.map((ch, i) => makePlayer(ch, i + 1));
  spawnStage(runStages[0]);
  appState = "playing";
  hideAllScreens();
  overlay.classList.add("hidden");
  updateHintText();
}

restartBtn.addEventListener("click", () => {
  if (gameState === "lost" && players.length === 1 && players[0].lives > 0) {
    spawnStage(runStages[stageIndex]);
  } else {
    stageIndex = 0;
    score = 0;
    players.forEach(p => { p.lives = LIVES_START; p.alive = true; });
    spawnStage(runStages[0]);
  }
  gameState = "playing";
  overlay.classList.add("hidden");
});
menuBtn.addEventListener("click", backToMenu);

// ====================== MENU & CÁC MÀN HÌNH CÀI ĐẶT ======================
function hideAllScreens() {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
}

function updateMenuButtonsState() {
  const has = !!loadJSON(STORAGE.CUSTOM_LEVEL, null);
  document.getElementById("btn-play-custom").disabled = !has;
}

function backToMenu() {
  appState = "menu";
  hideAllScreens();
  document.getElementById("screen-menu").classList.remove("hidden");
  overlay.classList.add("hidden");
  updateMenuButtonsState();
}

function keyLabel(k) {
  if (k === " ") return "Space";
  if (k === "ArrowLeft") return "←";
  if (k === "ArrowRight") return "→";
  if (k === "ArrowUp") return "↑";
  if (k === "ArrowDown") return "↓";
  return k.length === 1 ? k.toUpperCase() : k;
}

function actionLabel(a) {
  return { left: "Trái", right: "Phải", jump: "Nhảy/Bay", down: "Xuống", fire: "Bắn lửa" }[a];
}

function updateControlsUI() {
  document.querySelectorAll(".rebind-btn").forEach(btn => {
    const c = btn.dataset.player === "1" ? controls1 : controls2;
    btn.textContent = keyLabel(c[btn.dataset.actionKey]);
  });
}

function updateHintText() {
  const c1 = controls1, c2 = controls2;
  let t = "P1: " + keyLabel(c1.left) + "/" + keyLabel(c1.right) + " di chuyển, " + keyLabel(c1.jump) + " nhảy/bay, " +
    keyLabel(c1.fire) + " bắn lửa, " + keyLabel(c1.down) + " vào ống khói";
  if (players.length === 2) {
    t += "  ·  P2: " + keyLabel(c2.left) + "/" + keyLabel(c2.right) + " di chuyển, " + keyLabel(c2.jump) + " nhảy/bay, " +
      keyLabel(c2.fire) + " bắn lửa, " + keyLabel(c2.down) + " vào ống khói";
  }
  t += "  ·  Nhảy lên đầu quái/trùm để tiêu diệt · Đập khối \"?\" để ra nấm · Né gai, canh bệ di chuyển";
  hint.textContent = t;
}

function buildCharGrid(containerId, playerKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  CHARACTERS.forEach(ch => {
    const card = document.createElement("div");
    card.className = "char-card" + (selectedChar[playerKey] === ch.id ? " selected" : "");
    const cv = document.createElement("canvas");
    cv.width = 48; cv.height = 64;
    const cctx = cv.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    cctx.fillStyle = "#5c94fc";
    cctx.fillRect(0, 0, 48, 64);
    const spr = createPlayerSprite(32, 48, ch.shirt, ch.overalls);
    cctx.drawImage(spr, 8, 8, 32, 48);
    const nameEl = document.createElement("div");
    nameEl.className = "char-name";
    nameEl.textContent = ch.name;
    const skillEl = document.createElement("div");
    skillEl.className = "char-skill";
    skillEl.textContent = ch.skill;
    card.appendChild(cv);
    card.appendChild(nameEl);
    card.appendChild(skillEl);
    card.addEventListener("click", () => {
      selectedChar[playerKey] = ch.id;
      buildCharGrid(containerId, playerKey);
    });
    container.appendChild(card);
  });
}

function updateDiffButtonSelection() {
  document.querySelectorAll(".diff-btn").forEach(b => b.classList.toggle("selected", b.dataset.diff === difficultyKey));
}

function defaultCampaign() {
  return [
    { grid: buildStage1Grid(), enemySpeed: 1 },
    { grid: buildStage2CaveGrid(), enemySpeed: 1.8 },
    { grid: buildStage3TowerGrid(), enemySpeed: 1.3 },
    { grid: buildStage4Grid(), enemySpeed: 2.2, bossHp: 5 }
  ];
}

document.querySelectorAll("[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    if (action === "goto-charselect-1p") {
      pendingLaunch = { mode: "stages", playerCount: 1 };
      gotoCharSelect();
    } else if (action === "goto-charselect-2p") {
      pendingLaunch = { mode: "stages", playerCount: 2 };
      gotoCharSelect();
    } else if (action === "goto-charselect-custom") {
      const g = loadJSON(STORAGE.CUSTOM_LEVEL, null);
      if (!g) return;
      pendingLaunch = { mode: "custom", playerCount: 1 };
      gotoCharSelect();
    } else if (action === "start-game") {
      const char1 = CHARACTERS.find(c => c.id === selectedChar.p1);
      const char2 = pendingLaunch.playerCount === 2 ? CHARACTERS.find(c => c.id === selectedChar.p2) : null;
      const chars = [char1, char2].filter(Boolean);
      if (pendingLaunch.mode === "custom") {
        const g = loadJSON(STORAGE.CUSTOM_LEVEL, null);
        if (g) startRun([{ grid: g, enemySpeed: 1 }], chars);
      } else {
        startRun(defaultCampaign(), chars);
      }
    } else if (action === "goto-editor") enterEditor();
    else if (action === "goto-controls") {
      appState = "controls";
      hideAllScreens();
      document.getElementById("screen-controls").classList.remove("hidden");
      updateControlsUI();
    } else if (action === "goto-difficulty") {
      appState = "difficulty";
      hideAllScreens();
      document.getElementById("screen-difficulty").classList.remove("hidden");
      updateDiffButtonSelection();
    } else if (action === "back-to-menu") backToMenu();
    else if (action === "editor-scroll-left") editorCamera.x = Math.max(0, editorCamera.x - TILE * 8);
    else if (action === "editor-scroll-right") editorCamera.x = Math.min(editorMaxScroll(), editorCamera.x + TILE * 8);
    else if (action === "editor-save") {
      saveJSON(STORAGE.CUSTOM_LEVEL, editorGrid);
      const old = btn.textContent;
      btn.textContent = "Đã lưu ✓";
      setTimeout(() => { btn.textContent = old; }, 1000);
    } else if (action === "editor-play") {
      saveJSON(STORAGE.CUSTOM_LEVEL, editorGrid);
      pendingLaunch = { mode: "custom", playerCount: 1 };
      startRun([{ grid: editorGrid, enemySpeed: 1 }], [CHARACTERS.find(c => c.id === selectedChar.p1)]);
    }
  });
});

function gotoCharSelect() {
  appState = "charselect";
  hideAllScreens();
  document.getElementById("screen-charselect").classList.remove("hidden");
  document.getElementById("charselect-p2-col").classList.toggle("hidden", pendingLaunch.playerCount !== 2);
  buildCharGrid("char-grid-p1", "p1");
  if (pendingLaunch.playerCount === 2) buildCharGrid("char-grid-p2", "p2");
}

document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    difficultyKey = btn.dataset.diff;
    saveJSON(STORAGE.DIFFICULTY, difficultyKey);
    updateDiffButtonSelection();
  });
});

document.querySelectorAll(".rebind-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    rebindingAction = { player: btn.dataset.player, key: btn.dataset.actionKey };
    btn.textContent = "...";
    document.getElementById("rebind-hint").textContent =
      "Nhấn phím bất kỳ cho \"" + actionLabel(rebindingAction.key) + "\" (Người chơi " + rebindingAction.player + ")...";
  });
});

// ====================== LEVEL EDITOR ======================
function editorMaxScroll() {
  return Math.max(0, editorGrid[0].length * TILE - VIEW_WIDTH);
}

function enterEditor() {
  if (!editorGrid) editorGrid = loadJSON(STORAGE.CUSTOM_LEVEL, null) || makeBlankGrid(EDITOR_COLS);
  editorCamera.x = 0;
  appState = "editor";
  hideAllScreens();
  document.getElementById("screen-editor-toolbar").classList.remove("hidden");
  updateTileButtonSelection();
}

function updateTileButtonSelection() {
  document.querySelectorAll(".tile-btn").forEach(b => {
    b.classList.toggle("selected", parseInt(b.dataset.tile, 10) === editorSelectedTile);
  });
}

document.querySelectorAll(".tile-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    editorSelectedTile = parseInt(btn.dataset.tile, 10);
    updateTileButtonSelection();
  });
});

canvas.addEventListener("click", e => {
  if (appState !== "editor") return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;
  const col = Math.floor((clickX + editorCamera.x) / TILE);
  const row = Math.floor(clickY / TILE);
  if (row < 0 || row >= ROWS || col < 0 || col >= editorGrid[0].length) return;

  if (editorSelectedTile === 8 || editorSelectedTile === 6) {
    for (const r of editorGrid) {
      for (let cc = 0; cc < r.length; cc++) {
        if (r[cc] === editorSelectedTile) r[cc] = 0;
      }
    }
  }
  editorGrid[row][col] = editorSelectedTile;
});

function drawEditorTile(code, x, y) {
  switch (code) {
    case 1: ctx.fillStyle = "#5a3921"; ctx.fillRect(x, y, TILE, TILE); break;
    case 2:
      ctx.fillStyle = "#f2a541"; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("?", x + TILE / 2, y + TILE * 0.7);
      break;
    case 4: ctx.fillStyle = "#2e8b2e"; ctx.fillRect(x, y, TILE, TILE); break;
    case 9:
      ctx.fillStyle = "#3aa63a"; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, TILE, 6);
      break;
    case 5: ctx.fillStyle = "#8d5524"; ctx.fillRect(x + 4, y + 8, TILE - 8, TILE - 8); break;
    case 10: ctx.fillStyle = "#5c2a9d"; ctx.fillRect(x + 2, y, TILE - 4, TILE); break;
    case 6: ctx.fillStyle = "#e63946"; ctx.fillRect(x + TILE / 2 - 2, y, 4, TILE); break;
    case 7:
      ctx.fillStyle = "#ffd60a"; ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, TILE * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 8: ctx.fillStyle = "#2a6fdb"; ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12); break;
    case 11: ctx.fillStyle = "#c81d25"; ctx.fillRect(x + 6, y + TILE - 16, TILE - 12, 16); break;
    case 12: ctx.fillStyle = "#e07a5f"; ctx.fillRect(x, y + TILE / 2 - 8, TILE, 16); break;
    case 13: ctx.fillStyle = "#e07a5f"; ctx.fillRect(x + TILE / 2 - 8, y, 16, TILE); break;
  }
}

function drawEditor() {
  ctx.fillStyle = "#5c94fc";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < editorGrid[row].length; col++) {
      const code = editorGrid[row][col];
      if (!code) continue;
      const x = col * TILE - editorCamera.x;
      if (x < -TILE || x > VIEW_WIDTH) continue;
      drawEditorTile(code, x, row * TILE);
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let col = 0; col <= editorGrid[0].length; col++) {
    const x = col * TILE - editorCamera.x;
    if (x < 0 || x > VIEW_WIDTH) continue;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_HEIGHT); ctx.stroke();
  }
  for (let row = 0; row <= ROWS; row++) {
    ctx.beginPath(); ctx.moveTo(0, row * TILE); ctx.lineTo(VIEW_WIDTH, row * TILE); ctx.stroke();
  }
}

// ====================== INPUT BÀN PHÍM ======================
window.addEventListener("keydown", e => {
  if (rebindingAction) {
    e.preventDefault();
    const target = rebindingAction.player === "1" ? controls1 : controls2;
    target[rebindingAction.key] = e.key;
    saveJSON(rebindingAction.player === "1" ? STORAGE.CONTROLS1 : STORAGE.CONTROLS2, target);
    updateControlsUI();
    updateHintText();
    rebindingAction = null;
    document.getElementById("rebind-hint").textContent = "";
    return;
  }
  keysDown[e.key] = true;
});
window.addEventListener("keyup", e => { keysDown[e.key] = false; });

// ====================== VÒNG LẶP CHÍNH ======================
function loop() {
  if (appState === "playing") {
    update();
    drawGame();
  } else if (appState === "editor") {
    drawEditor();
  }
  requestAnimationFrame(loop);
}

applyDifficulty();
updateMenuButtonsState();
updateHintText();
requestAnimationFrame(loop);
