CREATE TABLE IF NOT EXISTS workflow_run_events (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  node_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  input JSON NULL,
  output JSON NULL,
  error JSON NULL,
  branch VARCHAR(64) NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  duration_ms INT NULL,
  event_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_run_id (run_id),
  INDEX idx_events_order (run_id, event_order),
  CONSTRAINT fk_run_events_run FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
