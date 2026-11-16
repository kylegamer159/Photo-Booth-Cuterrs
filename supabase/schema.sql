-- ═══════════════════════════════════════════════════════════════
-- Snap & Style — Supabase setup
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run again later: every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════

-- gen_random_uuid() on older projects
create extension if not exists pgcrypto;

-- 1. Gallery table -------------------------------------------------
create table if not exists public.snaps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  frame_id     text,
  frame_name   text,
  storage_path text not null,
  width        int,
  height       int,
  created_at   timestamptz not null default now()
);

create index if not exists snaps_user_created_idx
  on public.snaps (user_id, created_at desc);

-- 2. Row Level Security: only the owner can see / write rows -------
alter table public.snaps enable row level security;

drop policy if exists "snaps: read own"   on public.snaps;
drop policy if exists "snaps: insert own" on public.snaps;
drop policy if exists "snaps: delete own" on public.snaps;

create policy "snaps: read own"
  on public.snaps for select
  to authenticated
  using (auth.uid() = user_id);

create policy "snaps: insert own"
  on public.snaps for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "snaps: delete own"
  on public.snaps for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3. Private storage bucket for the images -------------------------
insert into storage.buckets (id, name, public)
values ('snaps', 'snaps', false)
on conflict (id) do nothing;

drop policy if exists "snaps bucket: upload own" on storage.objects;
drop policy if exists "snaps bucket: read own"   on storage.objects;
drop policy if exists "snaps bucket: delete own" on storage.objects;

-- files live at snaps/<user-id>/<file>.png
create policy "snaps bucket: upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'snaps'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "snaps bucket: read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'snaps'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "snaps bucket: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'snaps'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
