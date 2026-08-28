-- ============================================================
-- OrbitGuard AI Database Schema
-- Compatible with PostgreSQL 14+ and Supabase
-- Run: psql $DATABASE_URL -f schema.sql
-- ============================================================

-- Enable pgvector extension (for vector search)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ---- Spacecraft ----
CREATE TABLE IF NOT EXISTS spacecraft (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  mission         TEXT NOT NULL,
  launch_date     TIMESTAMPTZ NOT NULL,
  operator        TEXT NOT NULL,
  orbit_type      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'nominal'
                    CHECK (status IN ('nominal', 'warning', 'critical', 'offline', 'maintenance')),
  description     TEXT,
  norad_id        INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Telemetry readings ----
CREATE TABLE IF NOT EXISTS telemetry_readings (
  id                      TEXT PRIMARY KEY,
  spacecraft_id           TEXT NOT NULL REFERENCES spacecraft(id),
  timestamp               TIMESTAMPTZ NOT NULL,
  battery_voltage         REAL NOT NULL,
  power_consumption       REAL NOT NULL,
  temperature_internal    REAL NOT NULL,
  temperature_external    REAL NOT NULL,
  signal_strength         REAL NOT NULL,
  altitude                REAL NOT NULL,
  velocity                REAL NOT NULL,
  solar_panel_output      REAL,
  attitude_error          REAL,
  memory_usage            REAL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_spacecraft_ts
  ON telemetry_readings (spacecraft_id, timestamp DESC);

-- ---- Anomalies ----
CREATE TABLE IF NOT EXISTS anomalies (
  id                  TEXT PRIMARY KEY,
  spacecraft_id       TEXT NOT NULL REFERENCES spacecraft(id),
  anomaly_type        TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  parameter           TEXT NOT NULL,
  observed_value      REAL NOT NULL,
  expected_min        REAL NOT NULL,
  expected_max        REAL NOT NULL,
  confidence          REAL NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  explanation         TEXT NOT NULL,
  recommended_action  TEXT NOT NULL,
  related_parameters  TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_spacecraft ON anomalies (spacecraft_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_active ON anomalies (is_active, severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_ts ON anomalies (timestamp DESC);

-- ---- Subsystem health (snapshot per telemetry cycle) ----
CREATE TABLE IF NOT EXISTS subsystem_health (
  id              SERIAL PRIMARY KEY,
  spacecraft_id   TEXT NOT NULL REFERENCES spacecraft(id),
  timestamp       TIMESTAMPTZ NOT NULL,
  subsystem_name  TEXT NOT NULL,
  score           REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  status          TEXT NOT NULL,
  details         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subsystem_spacecraft_ts
  ON subsystem_health (spacecraft_id, timestamp DESC);

-- ---- AI insights / mission briefs ----
CREATE TABLE IF NOT EXISTS ai_insights (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL,     -- 'mission_brief' | 'copilot_response' | 'anomaly_explanation'
  spacecraft_id   TEXT REFERENCES spacecraft(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content         JSONB NOT NULL,
  ai_provider     TEXT NOT NULL DEFAULT 'demo',
  confidence      REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Missions ----
CREATE TABLE IF NOT EXISTS missions (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  start_date  TIMESTAMPTZ NOT NULL,
  end_date    TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Vector documents (requires pgvector extension) ----
-- Uncomment when pgvector is available:
-- CREATE TABLE IF NOT EXISTS vector_documents (
--   id          TEXT PRIMARY KEY,
--   content     TEXT NOT NULL,
--   embedding   vector(1536),      -- OpenAI ada-002 / 768 for Granite
--   metadata    JSONB NOT NULL DEFAULT '{}',
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_vector_embedding
--   ON vector_documents USING ivfflat (embedding vector_cosine_ops);

-- ---- Seed: Initial spacecraft ----
INSERT INTO spacecraft (id, name, mission, launch_date, operator, orbit_type, status, description)
VALUES
  ('ORBIT-01', 'ORBIT-01', 'Earth Observation Alpha',     '2023-03-15 00:00:00+00', 'OrbitGuard Operations', 'LEO', 'critical',    'Primary Earth observation satellite. Power system anomaly detected.'),
  ('ORBIT-02', 'ORBIT-02', 'Climate Monitoring Beta',     '2023-06-22 00:00:00+00', 'OrbitGuard Operations', 'SSO', 'warning',     'Climate monitoring satellite with mild thermal variation.'),
  ('ORBIT-03', 'ORBIT-03', 'Communications Relay Gamma',  '2022-11-08 00:00:00+00', 'OrbitGuard Operations', 'MEO', 'nominal',     'Communications relay satellite. All systems nominal.'),
  ('ORBIT-04', 'ORBIT-04', 'Science Platform Delta',      '2024-01-19 00:00:00+00', 'OrbitGuard Operations', 'GEO', 'nominal',     'Scientific research platform in geostationary orbit.'),
  ('ORBIT-05', 'ORBIT-05', 'Deep Space Survey Epsilon',   '2023-09-30 00:00:00+00', 'OrbitGuard Operations', 'HEO', 'warning',     'Deep space survey satellite. Signal degradation at apoapsis.')
ON CONFLICT (id) DO NOTHING;

-- ---- Functions ----
-- Get latest telemetry for a spacecraft
CREATE OR REPLACE FUNCTION get_latest_telemetry(sc_id TEXT)
RETURNS SETOF telemetry_readings AS $$
  SELECT * FROM telemetry_readings
  WHERE spacecraft_id = sc_id
  ORDER BY timestamp DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get telemetry in range
CREATE OR REPLACE FUNCTION get_telemetry_range(sc_id TEXT, hours_back INTEGER)
RETURNS SETOF telemetry_readings AS $$
  SELECT * FROM telemetry_readings
  WHERE spacecraft_id = sc_id
    AND timestamp >= NOW() - (hours_back || ' hours')::INTERVAL
  ORDER BY timestamp ASC;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Example query: Fleet health dashboard
-- ============================================================
-- SELECT
--   s.id,
--   s.name,
--   s.status,
--   t.battery_voltage,
--   t.power_consumption,
--   t.temperature_internal,
--   t.signal_strength,
--   COUNT(a.id) FILTER (WHERE a.is_active) AS active_anomalies
-- FROM spacecraft s
-- LEFT JOIN LATERAL get_latest_telemetry(s.id) t ON TRUE
-- LEFT JOIN anomalies a ON a.spacecraft_id = s.id
-- GROUP BY s.id, s.name, s.status, t.battery_voltage, t.power_consumption,
--          t.temperature_internal, t.signal_strength;
