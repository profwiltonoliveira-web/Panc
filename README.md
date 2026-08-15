# PANCpedia

Dicionário Enciclopédico Digital das Plantas Alimentícias Não Convencionais
de Itamira, distrito de Aporá — Bahia.

Projeto desenvolvido como parte de uma iniciação científica escolar.
Integra botânica, uso alimentar, saberes comunitários, patrimônio lexical
("A palavra em Itamira"), referências bibliográficas e um mapa territorial.

---

## 1. Stack utilizada

| Camada          | Tecnologia                                             |
|-----------------|---------------------------------------------------------|
| Frontend        | Next.js 14 (App Router) + React 18 + TypeScript          |
| Estilização     | Tailwind CSS                                             |
| Backend         | Route Handlers do Next.js + Supabase                     |
| Banco de dados  | PostgreSQL (via Supabase)                                |
| Autenticação    | Supabase Auth (e-mail/senha), com papéis via `profiles`  |
| Armazenamento   | Supabase Storage (fotografias)                           |
| Mapa            | Google My Maps (incorporado via `NEXT_PUBLIC_GOOGLE_MY_MAPS_EMBED_URL`) |

O projeto foi estruturado para que **banco, autenticação e armazenamento
possam ser administrados separadamente da interface** — se no futuro vocês
quiserem migrar do Supabase para outro provedor Postgres, apenas os arquivos
em `src/lib/supabase/` e `supabase/schema.sql` precisam ser adaptados; as
páginas e componentes não dependem diretamente do Supabase.

---

## 2. Estrutura de arquivos

```
pancpedia/
├── src/
│   ├── app/
│   │   ├── page.tsx                  → Home (consulta Supabase real)
│   │   ├── dicionario/                → /dicionario (índice alfabético real)
│   │   ├── panc/[slug]/               → /panc/[slug] (verbete, só status=publicado)
│   │   ├── busca/                     → /busca (busca real no Postgres)
│   │   ├── mapa/                      → /mapa (embed do Google My Maps)
│   │   ├── sobre/                     → /sobre
│   │   ├── referencias/               → /referencias
│   │   ├── login/                     → /login
│   │   ├── pesquisador/               → área do pesquisador (protegida)
│   │   │   ├── page.tsx               → painel (contadores reais, por autor)
│   │   │   └── verbetes/
│   │   │       ├── page.tsx           → "Meus verbetes" (escopado por autor_id)
│   │   │       ├── novo/              → criar verbete (Server Action)
│   │   │       ├── [id]/              → editar: conteúdo, linguística, saberes,
│   │   │       │                         referências, campo, localizações, fotos
│   │   │       └── actions.ts         → Server Actions do pesquisador
│   │   ├── admin/                     → área administrativa (protegida)
│   │   │   ├── page.tsx               → painel (contadores reais)
│   │   │   ├── verbetes/              → todos os verbetes (leitura)
│   │   │   ├── pesquisadores/         → pesquisadores reais + contagem
│   │   │   └── revisao/
│   │   │       ├── page.tsx           → fila real (em_revisao + aprovado)
│   │   │       └── actions.ts         → aprovar / publicar / devolver
│   │   └── globals.css                → tokens de design (cores, tipografia)
│   ├── components/                    → Header (sessão real + logout), Footer,
│   │                                     SearchBar, PlantCard, LexicalCard, VerbeteForm
│   ├── lib/
│   │   ├── types.ts                   → tipos TypeScript do domínio
│   │   ├── slug.ts                    → geração de slug para novos verbetes
│   │   ├── demo-data.ts               → dados fictícios (não usados por nenhuma
│   │   │                                 página real — ver seção 7)
│   │   ├── actions/auth.ts            → Server Action de logout
│   │   └── supabase/
│   │       ├── client.ts              → cliente para componentes de cliente
│   │       ├── server.ts              → cliente para Server Components/Actions
│   │       ├── mappers.ts             → converte linhas do Postgres para os
│   │       │                             tipos da interface
│   │       └── photo-url.ts           → gera URLs assinadas para o Storage privado
│   └── middleware.ts                  → protege /pesquisador e /admin no servidor
├── supabase/
│   └── schema.sql                     → schema completo + Row Level Security
│                                          + bucket e policies de Storage
├── TESTING.md                         → checklist de testes manuais (A/B/C/D)
├── public/demo-photos/                → imagem placeholder (não usada em produção)
├── .env.example
└── package.json
```

---

## 3. Modelo do banco de dados

Ver `supabase/schema.sql` para a definição completa (tipos, chaves
estrangeiras e Row Level Security). Resumo das entidades:

- **profiles** — usuários e papel (`administrador` | `pesquisador` | `visitante`)
- **plants** — o verbete (dados botânicos, uso alimentar, status editorial)
- **plant_photos** — fotografias (legenda, autoria, data, local)
- **linguistic_records** — "A palavra em Itamira" + etimologia
- **community_knowledge** — Saberes de Itamira
- **field_records** — registros de campo
- **references** — referências bibliográficas
- **locations** — pontos do mapa
- **revisions** — histórico do fluxo editorial
- **categories** — categorização dos verbetes

Um verbete (`plants`) pode ter várias fotos, vários registros linguísticos,
vários saberes, várias referências e vários registros de campo — todos
ligados por `plant_id`.

---

## 4. Perfis e permissões

| Papel            | Pode                                                                 |
|-------------------|-----------------------------------------------------------------------|
| **Visitante**     | Acessar toda a área pública (dicionário, verbetes publicados, mapa, busca) |
| **Pesquisador**    | Criar verbetes; editar/apagar apenas os próprios; anexar fotos e registros; salvar rascunho; enviar para revisão |
| **Administrador**  | Tudo o que o pesquisador pode, mais: revisar, aprovar, devolver para correção, publicar, gerenciar pesquisadores |

A segurança **não depende apenas da interface**: as rotas `/pesquisador/*` e
`/admin/*` são checadas em `src/middleware.ts` no servidor, e o banco aplica
Row Level Security (`supabase/schema.sql`) — um usuário não consegue acessar
dados administrativos apenas alterando a URL ou chamando a API diretamente.

---

## 5. Fluxo editorial

```
Rascunho → Em revisão → Aprovado → Publicado
              ↑___________________|
              (devolvido para correção, com justificativa)
```

O pesquisador nunca publica diretamente — essa garantia está no banco, não
só na interface: a policy de RLS de `plants` só permite ao pesquisador
gravar um verbete próprio com o resultado em `rascunho` ou `em_revisao`
(ver `supabase/schema.sql`). O administrador revisa (fila em
`/admin/revisao`) e pode aprovar, publicar ou devolver para correção com um
comentário obrigatório, que fica registrado em `revisions` e é mostrado ao
pesquisador na tela de edição do verbete.

---

## 6. Rotas

**Públicas:** `/`, `/dicionario`, `/panc/[slug]`, `/busca`, `/mapa`, `/sobre`, `/referencias`
**Privadas:** `/login`, `/pesquisador`, `/pesquisador/verbetes`, `/pesquisador/verbetes/novo`, `/pesquisador/verbetes/[id]`, `/admin`, `/admin/verbetes`, `/admin/pesquisadores`, `/admin/revisao`

---

## 7. Dados de demonstração

`src/lib/demo-data.ts` contém três verbetes **fictícios**, todos identificados
como **"DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR"**. Nenhuma página do site em
produção importa mais este arquivo — todas as páginas consultam o Supabase
real através de `src/lib/supabase/mappers.ts`. O arquivo foi mantido apenas
como referência do modelo de dados; pode ser apagado com segurança, junto
com `public/demo-photos/placeholder-folha.svg`, quando não for mais útil.

Para testar a interface com algum conteúdo antes de ter dados reais da
pesquisa, cadastre um verbete de verdade pela própria área do pesquisador
(`/pesquisador/verbetes/novo`) — é o caminho real de escrita, e o próprio
`demonstracao: boolean` do schema permanece disponível caso vocês queiram
marcar um verbete de teste como não-real antes de publicá-lo.

---

## 8. Executando localmente

Pré-requisitos: Node.js 18+ e uma conta gratuita no [Supabase](https://supabase.com).

```bash
# 1. Instalar dependências
npm install

# 2. Criar um projeto no Supabase e rodar o schema
#    Painel Supabase → SQL Editor → colar o conteúdo INTEIRO de
#    supabase/schema.sql → Run.
#    Isso cria as tabelas, as policies de RLS, a função is_admin() E o
#    bucket de Storage "fotos-verbetes" (privado) com suas policies —
#    não é preciso criar o bucket manualmente pelo painel.

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# preencher NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# e SUPABASE_SERVICE_ROLE_KEY com os valores do painel do seu projeto Supabase
# (Project Settings → API). A service role key não é usada por nenhuma
# rota hoje (todas as escritas passam pela sessão do usuário + RLS), mas
# fica disponível em src/lib/supabase/server.ts (createAdminClient) para
# uso futuro em tarefas administrativas que precisem ignorar RLS.

# 4. Criar os primeiros usuários
#    a) Painel Supabase → Authentication → Add user, para cada pessoa.
#       O trigger handle_new_user cria o profile automaticamente com
#       papel = 'pesquisador'.
#    b) Para promover alguém a administrador, no SQL Editor:
#       update profiles set papel = 'administrador' where id = '<uuid-do-usuario>';
#    c) Não existe tela pública de cadastro por desenho — o acesso é só por
#       convite/criação manual. Se "Allow sign-ups" estiver habilitado nas
#       configurações de Authentication do seu projeto Supabase, qualquer
#       pessoa poderia se registrar diretamente pela API do Supabase (não
#       pela interface, que não expõe cadastro) e virar pesquisador — vale
#       desligar essa opção caso o acesso deva ficar restrito a convite.

# 5. Rodar em desenvolvimento
npm run dev
# abrir http://localhost:3000

# 6. Testar de ponta a ponta
# Siga o checklist em TESTING.md com os dois usuários criados no passo 4.
```

---

## 9. Publicando em hospedagem própria

O projeto é um app Next.js padrão — não depende de nenhuma infraestrutura da
Anthropic/Claude e pode ser hospedado em qualquer provedor que suporte
Node.js (Vercel, Railway, um VPS com PM2 + Nginx, etc.).

```bash
npm run build
npm run start   # ou configure seu provedor para rodar "npm run build" + "npm run start"
```

Passos gerais:
1. Suba o repositório para o GitHub (ou envie os arquivos diretamente ao provedor).
2. No provedor escolhido, configure as mesmas variáveis de ambiente do `.env.example`.
3. Aponte o domínio **pancpedia.com.br** (registro A/CNAME, conforme o provedor)
   para o serviço publicado.
4. O Supabase (banco, autenticação, storage) continua rodando independente do
   provedor escolhido para o frontend/backend Next.js — por isso a separação
   feita em `src/lib/supabase/`.

---

## 10. Variáveis de ambiente necessárias

Ver `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (apenas em rotas de servidor/admin — nunca no cliente)
- `NEXT_PUBLIC_SITE_URL`

---

## 11. Estado atual e próximos passos

A camada de escrita está implementada e todas as páginas consultam o
Supabase real (nenhuma usa mais `demo-data.ts`). O que falta não é
arquitetura — é conteúdo real e testes de ponta a ponta com um projeto
Supabase configurado (ver `TESTING.md`):

- [ ] Configurar um projeto Supabase real e rodar o checklist completo de
      `TESTING.md` (não pôde ser executado nesta etapa por falta de
      credenciais — ver o relatório de entrega para detalhes)
- [ ] Popular o banco com os dados reais da pesquisa em Itamira
- [ ] Adicionar um seletor de categoria no formulário de verbete (a tabela
      `categories` existe no schema, mas o formulário ainda não a usa —
      não fazia parte do formulário original e não estava entre as
      funcionalidades pedidas nesta etapa)
- [ ] Revisão de acessibilidade e responsividade com conteúdo real (mais
      fácil de avaliar com dados reais do que com o formulário vazio)
- [ ] Definir o fluxo de convite de novos pesquisadores (hoje é manual, pelo
      painel do Supabase — ver seção 8, passo 4)
