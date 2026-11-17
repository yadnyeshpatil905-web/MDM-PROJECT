-- Smart Credential Lock: initial Supabase schema
-- Review and run once in the development project.

create extension if not exists pgcrypto;

-- 1. User profile; identity is managed by Supabase Auth.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null,
    email text not null,
    created_at timestamptz not null default now()
);

-- 2. Biometric templates: trusted backend only.
create table if not exists public.biometric_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique
        references auth.users(id) on delete cascade,
    template_data jsonb not null,
    template_version text not null,
    enrolled_at timestamptz not null default now(),
    status text not null default 'active'
        check (status in ('pending', 'active', 'revoked'))
);

-- 3. Vault PIN hashes: trusted backend only.
create table if not exists public.vault_credentials (
    user_id uuid primary key
        references auth.users(id) on delete cascade,
    pin_hash text not null,
    updated_at timestamptz not null default now()
);

-- 4. Authentication audit records.
create table if not exists public.authentication_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    biometric_result text not null default 'pending'
        check (biometric_result in
            ('pending', 'success', 'failure', 'unavailable')),
    pin_result text not null default 'pending'
        check (pin_result in
            ('pending', 'success', 'failure', 'not_required')),
    final_result text not null default 'pending'
        check (final_result in
            ('pending', 'success', 'failure', 'denied')),
    failure_reason text,
    created_at timestamptz not null default now()
);

-- 5. Vault activity history.
create table if not exists public.vault_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    event_type text not null
        check (event_type in
            ('open_authorized', 'open_failed', 'closed', 'lockout')),
    created_at timestamptz not null default now()
);

-- 6. Registered hardware devices.
create table if not exists public.devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null
        references auth.users(id) on delete cascade,
    device_name text not null,
    connection_status text not null default 'disconnected'
        check (connection_status in
            ('connected', 'disconnected', 'error')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_auth_attempts_user_time
    on public.authentication_attempts (user_id, created_at desc);

create index if not exists idx_vault_events_user_time
    on public.vault_events (user_id, created_at desc);

create index if not exists idx_devices_user
    on public.devices (user_id);

-- Automatically create a profile when a user registers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, email)
    values (
        new.id,
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
            'New User'
        ),
        coalesce(new.email, '')
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Enable RLS on every application table.
alter table public.profiles enable row level security;
alter table public.biometric_credentials enable row level security;
alter table public.vault_credentials enable row level security;
alter table public.authentication_attempts enable row level security;
alter table public.vault_events enable row level security;
alter table public.devices enable row level security;

-- Profiles: authenticated users can read/update their own profile.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Audit history: users can read only their own records.
drop policy if exists "Read own authentication attempts"
on public.authentication_attempts;

create policy "Read own authentication attempts"
on public.authentication_attempts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Read own vault events" on public.vault_events;
create policy "Read own vault events"
on public.vault_events for select
to authenticated
using ((select auth.uid()) = user_id);

-- Device metadata: users can read their own registered devices.
drop policy if exists "Read own devices" on public.devices;
create policy "Read own devices"
on public.devices for select
to authenticated
using ((select auth.uid()) = user_id);

-- Sensitive tables have no ordinary client access.
-- Trusted backend operations use a server-only privileged credential.
revoke all on table public.biometric_credentials
    from anon, authenticated;
revoke all on table public.vault_credentials
    from anon, authenticated;

-- Clients cannot forge audit events or device status.
revoke insert, update, delete
    on table public.authentication_attempts
    from anon, authenticated;

revoke insert, update, delete
    on table public.vault_events
    from anon, authenticated;

revoke insert, update, delete
    on table public.devices
    from anon, authenticated;

-- No public registration/profile enumeration.
revoke all on table public.profiles from anon;
