# PANCpedia — checklist de testes

Este projeto **não pôde ser testado de ponta a ponta** nesta etapa porque não
existe um projeto Supabase real configurado neste ambiente (ver
`README.md`, seção "Configurar o Supabase"). Nenhuma credencial foi
inventada. O que foi verificado sem um Supabase real, e o que só pode ser
confirmado por você depois de configurar o projeto, está descrito abaixo.

## O que já foi verificado nesta etapa (sem Supabase real)

- `npm install` — ok.
- `npm run build` (Next.js, inclui checagem de tipos) — **compilou sem
  erros**, todas as 17 rotas geradas.
- `npx tsc --noEmit` — sem erros de TypeScript.
- Servidor buildado (`npm run start`) rodando contra as credenciais de
  exemplo do `.env.example` (projeto Supabase inexistente, de propósito —
  nenhuma credencial real foi criada ou inventada):
  - `/`, `/dicionario`, `/busca`, `/mapa`, `/referencias`, `/sobre`, `/login`
    → HTTP 200, com estado vazio ("nenhum verbete publicado ainda") em vez
    de travar quando a consulta ao Supabase falha.
  - `/panc/um-slug-inexistente` → HTTP 404 (`notFound()`), como esperado.
  - `/pesquisador` e `/admin` sem sessão → HTTP 307 para
    `/login?next=/pesquisador` e `/login?next=/admin` — confirma que o
    `middleware.ts` bloqueia essas rotas no servidor mesmo sem qualquer
    interação de interface.
  - Nenhum erro 500 nem exceção não tratada no console do servidor em
    nenhuma dessas chamadas.
- Leitura linha a linha de cada policy de RLS em `supabase/schema.sql`
  contra os cenários de segurança abaixo (seção seguinte) — verificação
  lógica, não execução real contra um banco.

O que **não pôde** ser verificado por falta de um projeto Supabase real:
login efetivo, escrita real em qualquer tabela, upload real de arquivo,
e todo o roteiro A/B/C/D pedido na auditoria. Use o checklist abaixo depois
de seguir "Configurar o Supabase" no `README.md`.

## Como preparar o ambiente de teste

1. Siga o README para criar o projeto Supabase, rodar `supabase/schema.sql`
   e preencher `.env.local`.
2. Crie dois usuários pelo painel do Supabase (Authentication → Add user):
   um para ser pesquisador (papel padrão já é `pesquisador`) e outro para
   promover a administrador com
   `update profiles set papel = 'administrador' where id = '<uuid>';`.
3. `npm run dev` e abra `http://localhost:3000`.

## A) Visitante

- [ ] Abrir a homepage — carrega sem sessão.
- [ ] Buscar uma planta publicada em `/busca?q=...` — aparece nos resultados.
- [ ] Abrir um verbete publicado em `/panc/[slug]` — mostra identificação
      botânica, uso alimentar, saberes, referências e a ficha "A palavra em
      Itamira".
- [ ] Consultar `/dicionario` — índice alfabético só destaca letras de
      verbetes publicados.
- [ ] Consultar `/mapa` — só aparecem pontos de verbetes publicados.

## B) Pesquisador

- [ ] Login em `/login` com a conta de pesquisador.
- [ ] Criar verbete em `/pesquisador/verbetes/novo` — deve redirecionar para
      `/pesquisador/verbetes/[id]` com status "Rascunho".
- [ ] Salvar o formulário de conteúdo — recarregar a página e confirmar que
      os dados persistiram (não é só estado local).
- [ ] Sair ("Sair" no cabeçalho) e entrar novamente — o verbete criado
      continua lá em "Meus verbetes".
- [ ] Editar o verbete e salvar novamente.
- [ ] Preencher e salvar o registro linguístico ("A palavra em Itamira").
- [ ] Adicionar um saber de Itamira.
- [ ] Adicionar uma referência bibliográfica.
- [ ] Adicionar um registro de campo.
- [ ] Adicionar uma localização.
- [ ] Enviar para revisão — status muda para "Em revisão"; o formulário de
      conteúdo fica bloqueado (somente leitura) a partir daqui.
- [ ] Anexar uma fotografia (upload real) — deve aparecer na lista logo
      abaixo do formulário de upload.

## C) Administrador

- [ ] Login com a conta de administrador.
- [ ] Ver o verbete pendente em `/admin/revisao`.
- [ ] Devolver para correção com um comentário — o pesquisador, ao abrir o
      verbete, deve ver a justificativa no aviso "Devolvido para correção".
- [ ] Como pesquisador, corrigir e reenviar para revisão.
- [ ] Como administrador, aprovar — status muda para "Aprovado" e o botão
      passa a ser "Publicar".
- [ ] Publicar — o verbete passa a aparecer em `/dicionario`, `/busca`,
      `/mapa` (se tiver localização) e `/referencias` (se tiver referência).

## D) Segurança — tentativas que devem ser bloqueadas

- [ ] Pesquisador tenta publicar diretamente (ex.: chamando
      `supabase.from('plants').update({status:'publicado'})` pelo console do
      navegador autenticado como pesquisador) — deve falhar por RLS
      (`new row violates row-level security policy`).
- [ ] Pesquisador A tenta editar/apagar um verbete de outro pesquisador
      (trocando o `id` na URL de edição ou pelo console) — RLS bloqueia;
      nenhuma linha é alterada.
- [ ] Visitante (sem login) tenta abrir pelo console
      `supabase.from('plants').select('*').eq('status','rascunho')` — RLS
      retorna zero linhas.
- [ ] Usuário pesquisador tenta acessar `/admin` diretamente pela URL —
      middleware redireciona para `/pesquisador`.
- [ ] Usuário não autenticado tenta acessar `/admin` ou `/pesquisador` —
      middleware redireciona para `/login`.
- [ ] Usuário autenticado tenta alterar o próprio papel (ex.:
      `supabase.from('profiles').update({papel:'administrador'}).eq('id', meuId)`)
      — RLS bloqueia: não existe policy de update para o próprio usuário,
      só para administrador.
- [ ] Tentar baixar a fotografia de um verbete que não está publicado e não
      é seu (via URL de Storage) — bucket é privado; sem uma URL assinada
      válida gerada por quem tem permissão, o arquivo não é acessível.

Marque cada item ao confirmar manualmente — nenhum destes pode ser
declarado "concluído" sem essa confirmação com um Supabase real.
