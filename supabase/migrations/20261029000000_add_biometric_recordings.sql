-- Smart Credential Lock: Heart Sensor (Pulse Sensor) Raw Waveform Storage Schema
-- Migration: 20261029000000_add_biometric_recordings.sql
-- Preserves existing schema and adds public.biometric_recordings non-destructively.

create table if not exists public.biometric_recordings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    pulse_samples integer[],
    raw_samples integer[],
    red_samples integer[],
    ir_samples integer[],
    sample_rate integer not null check (sample_rate >= 10 and sample_rate <= 1000),
    sample_count integer not null check (sample_count >= 50 and sample_count <= 10000),
    device_info text default 'Heart Sensor (Pulse Sensor)',
    recorded_at timestamptz not null default now()
);

create index if not exists idx_biometric_recordings_user_time
    on public.biometric_recordings (user_id, recorded_at desc);

-- Enable Row Level Security (RLS)
alter table public.biometric_recordings enable row level security;

-- Revoke public and direct client access to protect sensitive raw biometric data.
-- Trusted backend with service_role key performs insertion and retrieval.
revoke all on table public.biometric_recordings from anon, authenticated;
