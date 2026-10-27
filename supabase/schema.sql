-- CATÁLOGO DE REFERÊNCIAS — Supabase/PostgreSQL
-- Execute no SQL Editor do seu projeto Supabase.
-- Não existe senha padrão. Crie um usuário em Authentication > Users e adicione o UUID abaixo em catalog_admins.
create extension if not exists pgcrypto;

create table if not exists public.catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.models (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  reference text null,
  pending_review boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.catalog_admins enable row level security;
alter table public.models enable row level security;

create or replace function public.is_catalog_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.catalog_admins where user_id = auth.uid()); $$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

-- Administradores podem ler e modificar os cadastros. Usuários não autenticados não têm acesso.
drop policy if exists "admin can read catalog admins" on public.catalog_admins;
create policy "admin can read catalog admins" on public.catalog_admins for select to authenticated using (public.is_catalog_admin());
drop policy if exists "admins manage models" on public.models;
create policy "admins manage models" on public.models for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());

grant select on public.catalog_admins to authenticated;
grant select, insert, update, delete on public.models to authenticated;

-- Depois de criar o usuário em Authentication > Users, execute substituindo o UUID:
-- insert into public.catalog_admins(user_id) values ('UUID-DO-USUARIO-AUTH');
