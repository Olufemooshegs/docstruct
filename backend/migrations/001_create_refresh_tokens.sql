-- Migration: create refresh_tokens table for storing refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_email ON refresh_tokens(email);
