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
| Mapa            | React-Leaflet + OpenStreetMap                             |

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
│   │   ├── page.tsx                  → Home
│   │   ├── dicionario/                → /dicionario
│   │   ├── panc/[slug]/               → /panc/[slug] (verbete)
│   │   ├── busca/                     → /busca
│   │   ├── mapa/                      → /mapa (+ MapaCliente.tsx)
│   │   ├── sobre/                     → /sobre
│   │   ├── referencias/               → /referencias
│   │   ├── login/                     → /login
│   │   ├── pesquisador/               → área do pesquisador (protegida)
│   │   │   ├── page.tsx               → painel
│   │   │   └── verbetes/              → listar / novo / editar
│   │   ├── admin/                     → área administrativa (protegida)
│   │   │   ├── page.tsx               → painel
│   │   │   ├── verbetes/
│   │   │   ├── pesquisadores/
│   │   │   └── revisao/               → fila de aprovação
│   │   └── globals.css                → tokens de design (cores, tipografia)
│   ├── components/                    → Header, Footer, SearchBar, PlantCard,
│   │                                     LexicalCard (ficha lexical), VerbeteForm
│   ├── lib/
│   │   ├── types.ts                   → tipos TypeScript do domínio
│   │   ├── demo-data.ts               → DADOS DE DEMONSTRAÇÃO (ver seção 7)
│   │   └── supabase/
│   │       ├── client.ts              → cliente para componentes de cliente
│   │       └── server.ts              → cliente para Server Components/Actions
│   └── middleware.ts                  → protege /pesquisador e /admin no servidor
├── supabase/
│   └── schema.sql                     → schema completo + Row Level Security
├── public/demo-photos/                → imagem placeholder de demonstração
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
```

O pesquisador nunca publica diretamente; o administrador revisa (fila em
`/admin/revisao`) e pode aprovar, publicar ou devolver para correção.

---

## 6. Rotas

**Públicas:** `/`, `/dicionario`, `/panc/[slug]`, `/busca`, `/mapa`, `/sobre`, `/referencias`
**Privadas:** `/login`, `/pesquisador`, `/pesquisador/verbetes`, `/pesquisador/verbetes/novo`, `/pesquisador/verbetes/[id]`, `/admin`, `/admin/verbetes`, `/admin/pesquisadores`, `/admin/revisao`

---

## 7. Dados de demonstração — IMPORTANTE

`src/lib/demo-data.ts` contém verbetes **fictícios** usados apenas para que a
interface possa ser visualizada durante o desenvolvimento. Todo conteúdo daí
é identificado como **"DADO DE DEMONSTRAÇÃO — NÃO PUBLICAR"** e não deve, em
hipótese alguma, ser tratado como informação real sobre Itamira, seus
moradores, plantas ou registros linguísticos.

Antes de publicar o site real:
1. Remova as importações de `demo-data.ts` das páginas e substitua pelas
   consultas Supabase (exemplos comentados em `panc/[slug]/page.tsx`).
2. Popule o banco com dados reais coletados na pesquisa.
3. Apague `public/demo-photos/placeholder-folha.svg` e o próprio
   `demo-data.ts` se não forem mais necessários.

---

## 8. Executando localmente

Pré-requisitos: Node.js 18+ e uma conta gratuita no [Supabase](https://supabase.com).

```bash
# 1. Instalar dependências
npm install

# 2. Criar um projeto no Supabase e rodar o schema
#    (Painel Supabase → SQL Editor → colar o conteúdo de supabase/schema.sql → Run)

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# preencher NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# e SUPABASE_SERVICE_ROLE_KEY com os valores do painel do seu projeto Supabase
# (Project Settings → API)

# 4. Criar o primeiro administrador
#    a) Cadastre um usuário normalmente pelo Supabase Auth (ou pela tela /login
#       após criar uma tela de cadastro, ou diretamente no painel Supabase → Authentication)
#    b) No SQL Editor, promova esse usuário:
#       update profiles set papel = 'administrador' where id = '<uuid-do-usuario>';

# 5. Rodar em desenvolvimento
npm run dev
# abrir http://localhost:3000
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

Este scaffold implementa a arquitetura completa (rotas, schema, RLS,
autenticação, componentes, fluxo editorial) com dados de demonstração no
frontend. Para chegar a produção, ainda é preciso:

- [ ] Conectar as páginas de listagem/verbete às consultas reais do Supabase
      (trocar `demo-data.ts` pelas chamadas comentadas em cada página)
- [ ] Implementar upload de fotografias para o Supabase Storage no `VerbeteForm`
- [ ] Implementar as Server Actions/Route Handlers de criar, salvar rascunho,
      enviar para revisão, aprovar, devolver e publicar
- [ ] Completar as policies de Row Level Security para todas as tabelas
      relacionadas (o schema traz o padrão pronto para `plant_photos`;
      replicar para `linguistic_records`, `community_knowledge`,
      `"references"` e `locations`)
- [ ] Popular o banco com os dados reais da pesquisa em Itamira
- [ ] Auditoria final: navegação, permissões, formulários, estados vazios,
      responsividade e acessibilidade em todas as páginas
