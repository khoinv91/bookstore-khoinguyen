-- Bảng lưu điểm người chơi cho bảng xếp hạng
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'normal',
  won INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (difficulty, score DESC, created_at ASC);
