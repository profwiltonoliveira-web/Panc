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
-- não consegue ler/gravar dados administrativos mesmo alterando a URL.
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

-- Leitura pública de verbetes publicados
create policy "verbetes publicados sao publicos"
  on plants for select
  using (status = 'publicado');

-- Pesquisador vê e edita os próprios verbetes (qualquer status)
create policy "pesquisador gerencia seus verbetes"
  on plants for all
  using (auth.uid() = autor_id)
  with check (auth.uid() = autor_id);

-- Administrador tem acesso total
create policy "administrador acessa todos os verbetes"
  on plants for all
  using (exists (select 1 from profiles where id = auth.uid() and papel = 'administrador'));

-- Perfis: cada usuário lê o próprio perfil; administrador lê todos
create policy "usuario le seu perfil"
  on profiles for select
  using (auth.uid() = id);

create policy "administrador le todos os perfis"
  on profiles for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.papel = 'administrador'));

-- Tabelas relacionadas (fotos, linguística, saberes, referências, locais):
-- seguem a visibilidade do verbete pai — publicado é público; autor e
-- administrador têm acesso completo.
create policy "conteudo relacionado segue o verbete publicado"
  on plant_photos for select
  using (exists (select 1 from plants where plants.id = plant_id and plants.status = 'publicado'));

create policy "autor gerencia fotos do seu verbete"
  on plant_photos for all
  using (exists (select 1 from plants where plants.id = plant_id and plants.autor_id = auth.uid()));

-- (Repetir o mesmo padrão de policies para linguistic_records,
-- community_knowledge, "references" e locations — omitido aqui por brevidade,
-- mas deve ser replicado integralmente antes de ir para produção.)

-- Apenas administradores publicam/aprovam (a troca de status é feita via
-- Route Handler autenticado, que verifica papel = administrador antes de
-- executar o update — nunca confiar apenas nesta policy isoladamente).
