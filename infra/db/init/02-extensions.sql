-- Extensiones necesarias.
CREATE EXTENSION IF NOT EXISTS timescaledb;  -- series de tiempo (telemetría)
CREATE EXTENSION IF NOT EXISTS postgis;      -- geometrías y geocercas
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
