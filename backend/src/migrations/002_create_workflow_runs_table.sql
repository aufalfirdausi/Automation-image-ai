CREATE TABLE IF NOT EXISTS workflow_runs (
  id VARCHAR(64) PRIMARY KEY,
  workflow_id VARCHAR(64) NOT NULL,
  workflow_version INT NOT NULL,
  workflow_snapshot JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  idempotency_key VARCHAR(128) NULL,
  error JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  INDEX idx_runs_workflow_id (workflow_id),
  INDEX idx_runs_status (status),
  INDEX idx_runs_created_at (created_at),
  UNIQUE INDEX uq_runs_workflow_idempotency (workflow_id, idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
