-- À exécuter une fois dans Supabase : Project > SQL Editor > New query.

create table if not exists kv_store (
  id text primary key,                 -- format "<user_id>:<clé>"
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz default now()
);

create index if not exists kv_store_user_id_idx on kv_store(user_id);

alter table kv_store enable row level security;

-- Chaque utilisateur ne peut lire/écrire QUE ses propres lignes.
create policy "Users can manage their own data"
  on kv_store
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
