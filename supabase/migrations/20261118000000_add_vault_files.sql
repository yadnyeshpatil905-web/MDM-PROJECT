-- Smart Credential Lock: Confidential Vault Files & Private Supabase Storage
-- Migration: 20261118000000_add_vault_files.sql
-- Adds public.vault_files metadata table, Row Level Security (RLS) policies,
-- and private Supabase Storage bucket 'vault-files' with strict owner-only policies.

create extension if not exists pgcrypto;

-- 1. Metadata table for user-uploaded Confidential Vault files
create table if not exists public.vault_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    file_name text not null check (length(trim(file_name)) > 0 and length(file_name) <= 255),
    file_path text not null unique check (length(trim(file_path)) > 0),
    file_type text not null default 'application/octet-stream',
    file_size bigint not null check (file_size >= 0),
    category text not null default 'General Vault',
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Indexes for fast per-user listing, search, and category filtering
create index if not exists idx_vault_files_user_created
    on public.vault_files (user_id, created_at desc);

create index if not exists idx_vault_files_user_category
    on public.vault_files (user_id, category);

-- Automatically maintain updated_at on row updates
create or replace function public.set_vault_files_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_vault_files_updated_at on public.vault_files;

create trigger trg_vault_files_updated_at
before update on public.vault_files
for each row execute function public.set_vault_files_updated_at();

-- 2. Enable Row Level Security (RLS) on public.vault_files
alter table public.vault_files enable row level security;

-- Block anonymous access completely
revoke all on table public.vault_files from anon;
grant select, insert, update, delete on table public.vault_files to authenticated;

drop policy if exists "Vault files: select own" on public.vault_files;
create policy "Vault files: select own"
on public.vault_files for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Vault files: insert own" on public.vault_files;
create policy "Vault files: insert own"
on public.vault_files for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Vault files: update own" on public.vault_files;
create policy "Vault files: update own"
on public.vault_files for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Vault files: delete own" on public.vault_files;
create policy "Vault files: delete own"
on public.vault_files for delete
to authenticated
using ((select auth.uid()) = user_id);

-- 3. Create PRIVATE Supabase Storage bucket 'vault-files' (never public)
-- Default file size limit: 50 MB (52428800 bytes), all MIME types allowed
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-files', 'vault-files', false, 52428800, null)
on conflict (id) do update
set public = false,
    file_size_limit = coalesce(storage.buckets.file_size_limit, 52428800);

-- 4. Storage RLS Policies on storage.objects for bucket 'vault-files'
-- Every object path is strictly namespaced as: <user_id>/<uuid>_<sanitized_filename>
-- Authenticated users may only access objects inside their own <user_id>/ folder.

drop policy if exists "Vault storage: select own objects" on storage.objects;
create policy "Vault storage: select own objects"
on storage.objects for select
to authenticated
using (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Vault storage: insert own objects" on storage.objects;
create policy "Vault storage: insert own objects"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Vault storage: update own objects" on storage.objects;
create policy "Vault storage: update own objects"
on storage.objects for update
to authenticated
using (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Vault storage: delete own objects" on storage.objects;
create policy "Vault storage: delete own objects"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);
