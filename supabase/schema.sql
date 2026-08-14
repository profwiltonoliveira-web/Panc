-- ============================================================================
-- PANCpedia — Schema Postgres (Supabase)
-- Dicionário Enciclopédico Digital das PANC de Itamira
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type papel_usuario as enum ('administrador', 'pesquisador', 'visitante');
create type status_verbete as enum ('rascunho', 'em_revisao', 'aprovado', 'publicado');
create type tipo_saber as enum ('uso_tradicional', 'forma_preparo', 'memoria', 'pratica', 'relato_campo');
create type tipo_referencia as enum ('livro', 'artigo', 'trabalho_academico', 'site_institucional', 'catalogo', 'entrevista', 'registro_campo', 'outro');
create type tipo_localizacao as enum ('ocorrencia', 'registro_campo', 'observacao', 'outro');

-- ---------------------------------------------------------------------------
-- PROFILES — espelha auth.users, adiciona papel e dados de perfil
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel papel_usuario not null default 'pesquisador',
  instituicao text,
  criado_em timestamptz not null default now()
);

-- Cria automaticamente um profile ao registrar um novo usuário
create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, nome, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'pesquisador');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------------
create table categories (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique,
  descricao text
);

-- ---------------------------------------------------------------------------
-- PLANTS — o verbete
-- ---------------------------------------------------------------------------
create table plants (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  nome_destaque text not null,
  nome_cientifico text,
  familia text,
  genero text,
  especie text,
  caracteristicas text,
  habitat text,
  ocorrencia text,
  observacoes_botanicas text,
  parte_utilizada text,
  forma_preparo text,
  forma_consumo text,
  receitas text,
  observacoes_uso text,
  descricao_curta text not null,
  status status_verbete not null default 'rascunho',
  categoria_id uuid references categories(id),
  autor_id uuid not null references profiles(id),
  demonstracao boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index plants_status_idx on plants(status);
create index plants_slug_idx on plants(slug);

-- ---------------------------------------------------------------------------
-- PLANT_PHOTOS
-- ---------------------------------------------------------------------------
create table plant_photos (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  url text not null,
  legenda text,
  autoria text,
  data date,
  local_registro text,
  principal boolean not null default false,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LINGUISTIC_RECORDS — "A palavra em Itamira" + etimologia
-- ---------------------------------------------------------------------------
create table linguistic_records (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  nome_popular text not null,
  variacoes text[] not null default '{}',
  pronuncia text,
  significado text,
  origem_nome text,
  uso_linguistico text,
  expressoes_relacionadas text,
  observacao_linguistica text,          -- ANÁLISE DOS PESQUISADORES
  fonte_registro text not null,          -- DADO REGISTRADO
  etimologia_origem text,
  etimologia_lingua_origem text,
  etimologia_significado text,
  etimologia_fonte text,
  etimologia_observacoes text,
  etimologia_nao_determinada boolean not null default true
);

-- ---------------------------------------------------------------------------
-- COMMUNITY_KNOWLEDGE — Saberes de Itamira
-- ---------------------------------------------------------------------------
create table community_knowledge (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  descricao text not null,
  tipo tipo_saber not null,
  fonte_compativel text not null,   -- identificação da fonte respeitando critérios éticos (sem dados sensíveis)
  registrado_em date not null default current_date
);

-- ---------------------------------------------------------------------------
-- FIELD_RECORDS — registros de campo (observações, visitas, coletas)
-- ---------------------------------------------------------------------------
create table field_records (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid references plants(id) on delete cascade,
  pesquisador_id uuid not null references profiles(id),
  descricao text not null,
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- REFERENCES — fontes bibliográficas
-- ---------------------------------------------------------------------------
create table "references" (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  tipo tipo_referencia not null,
  titulo text not null,
  autor text,
  ano text,
  fonte text,
  url text
);

-- ---------------------------------------------------------------------------
-- LOCATIONS — pontos do mapa de Itamira
-- ---------------------------------------------------------------------------
create table locations (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid references plants(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  tipo tipo_localizacao not null,
  descricao text
);

-- ---------------------------------------------------------------------------
-- REVISIONS — histórico de revisão editorial
-- ---------------------------------------------------------------------------
create table revisions (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  revisor_id uuid not null references profiles(id),
  status_anterior status_verbete not null,
  status_novo status_verbete not null,
  comentario text,
  criado_em timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- A segurança é aplicada no banco, não apenas na interface: um usuário comum
-- não consegue ler/gravar dados administrativos mesmo alterando a URL ou
-- chamando a API do Supabase diretamente pelo navegador.
-- ============================================================================

alter table plants enable row level security;
alter table plant_photos enable row level security;
alter table linguistic_records enable row level security;
alter table community_knowledge enable row level security;
alter table field_records enable row level security;
alter table "references" enable row level security;
alter table locations enable row level security;
alter table revisions enable row level security;
alter table profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Função auxiliar: is_admin()
-- security definer para evitar recursão ao consultar "profiles" dentro de
-- policies da própria tabela "profiles", e para não repetir o mesmo
-- subselect em todas as policies administrativas abaixo.
-- ---------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and papel = 'administrador'
  );
$$;

-- ---------------------------------------------------------------------------
-- PROFILES
-- Cada usuário lê o próprio perfil; administrador lê e atualiza todos
-- (promoção/rebaixamento de papel). Não existe policy de update para o
-- próprio usuário: ninguém pode alterar seu próprio papel pelo cliente.
-- ---------------------------------------------------------------------------
create policy "usuario le seu perfil"
  on profiles for select
  using (auth.uid() = id);

create policy "administrador le todos os perfis"
  on profiles for select
  using (is_admin());

create policy "administrador atualiza perfis"
  on profiles for update
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- PLANTS
-- Leitura pública: somente verbetes com status = 'publicado'.
-- Pesquisador: vê e edita apenas os próprios verbetes, em qualquer status,
-- mas só pode GRAVAR (insert/update) com o resultado em 'rascunho' ou
-- 'em_revisao' — nunca 'aprovado' ou 'publicado'. Essa é a garantia, no
-- banco, de que um pesquisador não consegue se autopublicar alterando a
-- URL ou chamando a API diretamente: mesmo que a interface tente enviar
-- status = 'publicado', o Postgres rejeita a escrita.
-- Administrador: acesso total, incluindo aprovar/publicar/devolver.
-- ---------------------------------------------------------------------------
create policy "verbetes publicados sao publicos"
  on plants for select
  using (status = 'publicado');

create policy "pesquisador ve seus verbetes"
  on plants for select
  using (auth.uid() = autor_id);

create policy "pesquisador cria seus verbetes"
  on plants for insert
  with check (auth.uid() = autor_id and status = 'rascunho');

create policy "pesquisador atualiza seus verbetes em rascunho ou revisao"
  on plants for update
  using (auth.uid() = autor_id)
  with check (auth.uid() = autor_id and status in ('rascunho', 'em_revisao'));

create policy "pesquisador apaga seus rascunhos"
  on plants for delete
  using (auth.uid() = autor_id and status = 'rascunho');

create policy "administrador acessa todos os verbetes"
  on plants for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Conteúdo relacionado (fotos, linguística, saberes, referências, locais):
-- segue a visibilidade do verbete pai — publicado é público; autor do
-- verbete e administrador têm acesso completo de leitura e escrita.
-- ---------------------------------------------------------------------------

-- PLANT_PHOTOS
create policy "fotos publicas seguem o verbete publicado"
  on plant_photos for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia fotos do seu verbete"
  on plant_photos for all
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()))
  with check (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador gerencia todas as fotos"
  on plant_photos for all
  using (is_admin())
  with check (is_admin());

-- LINGUISTIC_RECORDS — "A palavra em Itamira"
create policy "registros linguisticos publicos seguem o verbete publicado"
  on linguistic_records for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia registro linguistico do seu verbete"
  on linguistic_records for all
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()))
  with check (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador gerencia todos os registros linguisticos"
  on linguistic_records for all
  using (is_admin())
  with check (is_admin());

-- COMMUNITY_KNOWLEDGE — Saberes de Itamira
create policy "saberes publicos seguem o verbete publicado"
  on community_knowledge for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia saberes do seu verbete"
  on community_knowledge for all
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()))
  with check (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador gerencia todos os saberes"
  on community_knowledge for all
  using (is_admin())
  with check (is_admin());

-- "REFERENCES" — referências bibliográficas
create policy "referencias publicas seguem o verbete publicado"
  on "references" for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia referencias do seu verbete"
  on "references" for all
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()))
  with check (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador gerencia todas as referencias"
  on "references" for all
  using (is_admin())
  with check (is_admin());

-- LOCATIONS — pontos do mapa
-- Só é pública se estiver associada a um verbete publicado; localizações
-- sem verbete associado (plant_id nulo) ficam restritas a autor/administrador.
create policy "localizacoes publicas seguem o verbete publicado"
  on locations for select
  using (plant_id is not null and exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia localizacoes do seu verbete"
  on locations for all
  using (plant_id is not null and exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()))
  with check (plant_id is not null and exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador gerencia todas as localizacoes"
  on locations for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- FIELD_RECORDS — registros de campo do pesquisador
-- Uso interno da pesquisa, nunca exibido na área pública: sem policy de
-- select público (RLS ligado sem policy = acesso negado por padrão).
-- ---------------------------------------------------------------------------
create policy "pesquisador gerencia seus registros de campo"
  on field_records for all
  using (pesquisador_id = auth.uid())
  with check (pesquisador_id = auth.uid());

create policy "administrador gerencia todos os registros de campo"
  on field_records for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- REVISIONS — histórico do fluxo editorial
-- O autor do verbete consegue ver o histórico (para ler a justificativa de
-- uma devolução); administrador vê e registra tudo. Cada linha só pode ser
-- criada por quem realizou a transição (o próprio pesquisador ao enviar
-- para revisão, ou o administrador ao aprovar/devolver/publicar).
-- ---------------------------------------------------------------------------
create policy "autor ve revisoes do seu verbete"
  on revisions for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

create policy "administrador ve todas as revisoes"
  on revisions for select
  using (is_admin());

create policy "autor registra transicao do seu verbete"
  on revisions for insert
  with check (
    revisor_id = auth.uid()
    and exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid())
  );

create policy "administrador registra qualquer transicao"
  on revisions for insert
  with check (is_admin());

-- ============================================================================
-- STORAGE — fotografias dos verbetes
-- Bucket privado: o acesso (leitura e escrita) é controlado por policy em
-- storage.objects, replicando a mesma regra de plant_photos. O caminho do
-- arquivo segue a convenção "<plant_id>/<nome-do-arquivo>", o que permite à
-- policy identificar a qual verbete cada foto pertence.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('fotos-verbetes', 'fotos-verbetes', false)
on conflict (id) do nothing;

create policy "fotos de verbetes publicados sao visiveis"
  on storage.objects for select
  using (
    bucket_id = 'fotos-verbetes'
    and exists (
      select 1 from plants
      where plants.id::text = (storage.foldername(name))[1]
      and plants.status = 'publicado'
    )
  );

create policy "autor gerencia arquivos do seu verbete"
  on storage.objects for all
  using (
    bucket_id = 'fotos-verbetes'
    and exists (
      select 1 from plants
      where plants.id::text = (storage.foldername(name))[1]
      and plants.autor_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'fotos-verbetes'
    and exists (
      select 1 from plants
      where plants.id::text = (storage.foldername(name))[1]
      and plants.autor_id = auth.uid()
    )
  );

create policy "administrador gerencia todos os arquivos de fotos"
  on storage.objects for all
  using (bucket_id = 'fotos-verbetes' and is_admin())
  with check (bucket_id = 'fotos-verbetes' and is_admin());
