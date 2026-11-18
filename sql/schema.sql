-- À exécuter une fois dans Supabase : Project > SQL Editor > New query.

create table if not exists kv_store (
  id text primary key,                 -- format "<user_id>:<clé>"
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),

  -- La clé primaire DOIT correspondre au propriétaire de la ligne.
  --
  -- Sans cette contrainte, `id` est un texte libre : rien n'empêchait un
  -- utilisateur d'insérer une ligne `id = '<autre_utilisateur>:profile'` avec
  -- son propre `user_id`. La RLS l'empêchait bien de LIRE quoi que ce soit de
  -- la victime — aucune fuite — mais la clé primaire de celle-ci se retrouvait
  -- occupée : son propre upsert tombait alors sur un conflit qu'elle n'avait
  -- pas le droit de résoudre, et ses écritures échouaient en silence.
  constraint kv_store_id_coherent check (id = user_id::text || ':' || key)
);

create index if not exists kv_store_user_id_idx on kv_store(user_id);

alter table kv_store enable row level security;

-- Chaque utilisateur ne peut lire/écrire QUE ses propres lignes.
-- `drop if exists` d'abord : `create policy` n'accepte pas `if not exists`, et
-- rejouer ce script sur une base existante échouait sur cette seule ligne.
drop policy if exists "Users can manage their own data" on kv_store;
create policy "Users can manage their own data"
  on kv_store
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BASE DÉJÀ EN SERVICE : la contrainte ci-dessus ne s'applique pas toute seule.
-- Elle n'est PAS nécessaire au fonctionnement de l'application ; elle ferme un
-- déni d'écriture qui suppose un attaquant connaissant ton identifiant
-- utilisateur. À exécuter à la main dans l'éditeur SQL de Supabase, si tu le
-- souhaites :
--
--   alter table kv_store
--     add constraint kv_store_id_coherent
--     check (id = user_id::text || ':' || key);
--
-- Si la commande échoue, c'est qu'une ligne ne respecte pas déjà la règle :
--   select id, user_id, key from kv_store where id <> user_id::text || ':' || key;
-- ─────────────────────────────────────────────────────────────────────────────
