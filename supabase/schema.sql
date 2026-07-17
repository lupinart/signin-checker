create table if not exists public.project_rules (
  id text primary key,
  active boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.project_rules enable row level security;

create policy "Public can read active project rules"
on public.project_rules for select
to anon
using (active = true);

create policy "Administrators can read all project rules"
on public.project_rules for select
to authenticated
using (true);

create policy "Administrators can insert project rules"
on public.project_rules for insert
to authenticated
with check (true);

create policy "Administrators can update project rules"
on public.project_rules for update
to authenticated
using (true)
with check (true);

create policy "Administrators can delete project rules"
on public.project_rules for delete
to authenticated
using (true);
