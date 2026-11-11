-- =====================================================================
-- Caixa Simples — banco de dados (rodar UMA vez no SQL Editor do Supabase)
-- =====================================================================
-- Guarda só entradas e saídas. Valores em CENTAVOS (inteiro).
-- Só quem está na lista `acesso` enxerga ou lança algo; visitante não vê nada.

-- Quem pode usar (e-mails em minúsculas). Veja o final do arquivo.
create table public.acesso (
  email text primary key check (email = lower(email) and email like '%_@_%')
);

create function public.tem_acesso() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.acesso where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,                                                   -- dia a que o lançamento pertence (pode ser antigo)
  tipo text not null check (tipo in ('entrada', 'saida')),
  forma text not null check (forma in ('dinheiro', 'cartao')),
  valor_centavos bigint not null check (valor_centavos > 0 and valor_centavos <= 100000000000),
  categoria text not null check (length(trim(categoria)) between 1 and 60),
  descricao text check (length(descricao) <= 300),
  criado_por uuid not null default auth.uid() references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz                                               -- exclusão "suave": o registro continua guardado
);
create index lancamentos_data_idx on public.lancamentos (data desc, criado_em desc) where excluido_em is null;

create function public.toca_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger lancamentos_atualizado before update on public.lancamentos
  for each row execute function public.toca_atualizado_em();

-- Segurança
alter table public.acesso enable row level security;
alter table public.lancamentos enable row level security;

revoke all on public.acesso, public.lancamentos from anon, authenticated;
grant select on public.acesso to authenticated;
grant select on public.lancamentos to authenticated;
grant insert (id, data, tipo, forma, valor_centavos, categoria, descricao) on public.lancamentos to authenticated;
grant update (data, tipo, forma, valor_centavos, categoria, descricao, excluido_em) on public.lancamentos to authenticated;
revoke all on function public.tem_acesso() from public, anon;
grant execute on function public.tem_acesso() to authenticated;
revoke all on function public.toca_atualizado_em() from public, anon, authenticated;

create policy acesso_proprio on public.acesso for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));

create policy lanc_ler on public.lancamentos for select to authenticated
  using ((select public.tem_acesso()));
create policy lanc_criar on public.lancamentos for insert to authenticated
  with check ((select public.tem_acesso()) and criado_por = (select auth.uid()));
create policy lanc_alterar on public.lancamentos for update to authenticated
  using ((select public.tem_acesso())) with check ((select public.tem_acesso()));

-- =====================================================================
-- DEPOIS de rodar tudo acima, libere as pessoas (troque pelos e-mails reais):
--   insert into public.acesso (email) values ('seu-email@gmail.com'), ('email-do-seu-pai@gmail.com');
-- E crie o login de cada uma em Authentication > Users > Add user (e-mail + senha).
-- =====================================================================
