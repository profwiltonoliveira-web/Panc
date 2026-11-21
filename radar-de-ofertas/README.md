# Radar de Ofertas — extensão Chrome (MVP v0.3.0)

Busca produtos no Mercado Livre, compara preços entre anúncios **equivalentes** (incluindo o frete, quando informado), classifica as ofertas e guarda um histórico local de preços.
Sem backend e sem serviços pagos: tudo roda no navegador, e os dados ficam em `chrome.storage.local`.

---

## 1. Instalação (modo desenvolvedor)

1. Baixe/clone o repositório e localize a pasta `radar-de-ofertas/`.
2. No Chrome, abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `radar-de-ofertas/` (a que contém `manifest.json`).
5. Clique no ícone de quebra-cabeça da barra e **fixe** o Radar de Ofertas.
6. Para atualizar depois de mudar o código: em `chrome://extensions`, clique em ↻ na extensão.

## 2. Primeiro uso — leia isto

- Antes da primeira busca, **abra https://www.mercadolivre.com.br em uma aba normal**. Se aparecer verificação de segurança, conclua-a. A extensão usa a mesma sessão do navegador.
- Digite o produto da forma mais específica possível (ex.: `iphone 13 128gb`, `fone jbl tune 520bt`). Termos específicos melhoram a detecção de anúncios equivalentes.
- O histórico começa vazio. **Nas primeiras buscas nenhum anúncio recebe "Excelente oportunidade"**, por desenho: sem histórico não há como comprovar que o desconto é real. Repita a busca em dias diferentes para acumular evidência.

## 3. Como usar

| Onde | O quê |
|---|---|
| Ícone da extensão | Abre o popup. **⤢ Tela cheia** abre a mesma interface numa aba. |
| Botão direito sobre um texto selecionado | **Buscar "…" no Radar de Ofertas** abre a busca numa aba. |
| Aba **Buscar** | Resultados, filtros e classificações. Clique em **Por quê?** para ver o motivo de cada classificação. |
| ☆ / ★ em um resultado | Acompanhar o preço daquele anúncio. |
| Aba **Histórico** | Pesquisas recentes (clique para repetir), preços observados por anúncio com mini-gráfico, **Exportar JSON** e **Apagar histórico**. |
| Aba **Acompanhando** | Itens marcados com ★ e a variação desde que foram marcados. |

### Filtros
- **Só frete grátis**.
- **Ocultar usados**: esconde anúncios identificados como usados ou recondicionados. Anúncios sem indicação de condição continuam visíveis.
- **Só equivalentes**: esconde acessórios e anúncios que não contêm os termos da busca.
- Classificação e ordenação (menor ou maior total, maior desconto anunciado). Anúncios não equivalentes ficam sempre no fim.

## 4. Como os resultados são obtidos

A extensão tenta, nesta ordem:

1. **API pública oficial** (`api.mercadolibre.com/sites/MLB/search`). Hoje responde **HTTP 403** sem autenticação; a chamada é mantida porque é gratuita e volta a funcionar se o acesso for reaberto.
2. **Leitura direta** da página `lista.mercadolivre.com.br/<termo>` por requisição.
3. **Aba do navegador** (automático, se 1 e 2 não trouxerem anúncios): a extensão abre a página de resultados **em segundo plano no seu Chrome**, espera ela carregar e lê os anúncios do DOM. Se a leitura der certo, fecha a aba.
   - Se o Mercado Livre pedir **verificação de segurança, login ou bloquear** a página, **nada é contornado**: a aba fica aberta e aparece o botão **Ir para a aba do ML**. Resolva lá e clique em **Ler aba do ML**.
4. **Ler aba do ML** (manual): lê a página de resultados do ML que você abriu e pesquisou normalmente no site. O termo pesquisado na página é usado na análise.

Para ler os anúncios, a extensão tenta três estratégias, e a usada aparece no resumo como "estratégia …":

| Estratégia | O que lê |
|---|---|
| `json` | Dados dos cards ("polycard") que a página traz embutidos em `<script>`. É a mais resistente a mudanças visuais. |
| `dom` | Cards renderizados (`li.ui-search-layout__item`, `.poly-card`). |
| `links` | Varredura genérica: links de anúncio (`/MLB-…`, `/p/MLB…`) com preço no mesmo bloco. |

**Nenhum resultado é inventado.** Se nada funcionar, a extensão mostra o motivo de cada etapa e o botão **Copiar diagnóstico**.

### Diagnóstico
O botão **Copiar diagnóstico** copia um JSON **estrutural**, sem textos da página e sem dados pessoais. Ele contém:
- versão, origem (leitura direta ou aba), URL, status HTTP, título da página e tamanho do HTML;
- **tipo de página**: `resultados`, `verificacao`, `bloqueio`, `login`, `sem-resultados`, `pagina-de-produto` ou `desconhecida`;
- quantos anúncios cada estratégia leu e contagens de elementos (cards, preços, links de anúncio, scripts com "polycard");
- as classes CSS mais frequentes da busca (`ui-search…`, `poly…`), para ajustar os seletores.

Cole esse JSON numa mensagem para o desenvolvedor quando a coleta falhar.

| Mensagem | O que fazer |
|---|---|
| `verificação de segurança` | Clique em **Ir para a aba do ML**, conclua a verificação e clique em **Ler aba do ML**. |
| `bloqueou o acesso ("Hubo un error…")` | Desative VPN ou proxy se houver, abra mercadolivre.com.br normalmente, pesquise no site e clique em **Ler aba do ML**. |
| `nenhum anúncio foi reconhecido` | Clique em **Copiar diagnóstico** e envie: os seletores precisam de ajuste. |
| `o histórico não pôde ser salvo` | Os resultados continuam visíveis. Exporte e apague o histórico. |

## 5. Comparação de preços

- **Total** = preço + frete, quando o frete é conhecido. Quando não é, o total aparece com `*`. Normalmente o frete só é identificado quando é grátis.
- **Anúncios equivalentes**: só se comparam anúncios do mesmo grupo.
  - O título precisa conter todos os termos da busca. São aceitos plural e "520bt" = "520 bt". Números precisam bater exatamente: "15" ≠ "150".
  - Acessórios e peças ficam fora quando a palavra aparece antes do produto ("**Capa** para iPhone 13", "**Película** iPhone 13"). Títulos com "compatível", "réplica" ou "similar" também ficam fora.
  - Variantes formam grupos separados: Pro, Max, Plus, Mini, Ultra, Lite, FE etc., capacidades (128 GB vs 256 GB) e usado/recondicionado vs novo.
- **% vs mais barato equivalente** e **% vs mediana** são calculados dentro do grupo. A mediana só é usada com **3 ou mais** anúncios equivalentes. Anúncios abaixo de 40% da mediana não servem de referência de "mais barato".

## 6. Classificação de promoções

Cada classificação mostra o motivo e um nível de **confiança**: baixa, média ou alta. A confiança cresce com o número de dias de histórico: 1 dia = baixa, 2 = média, 3 ou mais = alta.

| Classificação | Regra |
|---|---|
| **Excelente oportunidade** | **Só com histórico**: menor preço já registrado para o anúncio e ≥10% abaixo da média histórica. |
| **Boa oportunidade** | ≥3% abaixo da média histórica; ou, sem histórico, ≥20% abaixo da mediana de ≥3 equivalentes (confiança baixa). |
| **Preço regular** | Dentro ou acima da faixa, ou sem dados suficientes para comparar. |
| **Desconto suspeito** | Preço "de" nunca observado no histórico (o maior preço visto é <90% dele); "% OFF" ≥50% sem histórico; ou preço >60% abaixo da mediana de equivalentes. |

Observações:
- O histórico registra só o **preço de venda** observado nas buscas. O preço "de" (riscado) anunciado pelo vendedor não vira evidência.
- Observações da última hora são ignoradas, para a busca não "confirmar a si mesma".

## 7. Histórico e privacidade

- Fica salvo apenas em `chrome.storage.local`, neste navegador. A extensão só faz requisições ao Mercado Livre, e as imagens vêm do CDN `mlstatic.com`.
- No máximo 1 ponto de preço por anúncio por hora, 120 pontos por anúncio, 200 pesquisas e 2.500 anúncios. Ao passar disso, saem os anúncios vistos há mais tempo; **itens com ★ nunca são removidos**.
- Anúncios cujo link não tem ID (alguns patrocinados, com link `click1.mercadolivre…`) não entram no histórico e não podem receber ★.

## 8. Permissões (Manifest V3)

| Permissão | Motivo |
|---|---|
| `storage` | Histórico, pesquisas e itens acompanhados. |
| `contextMenus` | Item "Buscar no Radar de Ofertas" no botão direito. |
| `scripting` | Injetar o leitor (`lib/ml-parser.js`, só leitura) **apenas** nas abas `lista.mercadolivre.com.br` e `www.mercadolivre.com.br`, quando a busca precisa da aba ou você clica em **Ler aba do ML**. |
| `host_permissions`: `api.mercadolibre.com`, `lista.mercadolivre.com.br`, `www.mercadolivre.com.br` | Buscar resultados e, nessas abas, ler a URL e injetar o leitor. |

Não usa `tabs`, `<all_urls>`, `webRequest` nem content scripts permanentes: o leitor só é injetado sob demanda nas páginas do ML. A CSP só permite scripts da própria extensão e imagens de `*.mlstatic.com`.

## 9. Testes

```bash
cd radar-de-ofertas
npm test               # 24 testes unitários (Node ≥ 18)
npm run test:e2e       # 21 cenários com a extensão no Chromium (Playwright)
npm run test:e2e:tab   # 7 cenários da coleta v0.3: JSON embutido, aba em 2º plano, "Ler aba do ML", verificação, diagnóstico
```

Os testes e2e usam **rede simulada com HTML sintético**. `test:e2e:tab` sobe um servidor HTTPS local e aponta os domínios do ML para ele via `--host-resolver-rules`. Eles validam a lógica, mas **não substituem** o teste com o site real.

### Checklist de teste real (no seu Chrome)
1. Atualize a extensão: em `chrome://extensions`, clique em ↻, ou remova e carregue a pasta nova.
2. Abra o popup e busque `Samsung Galaxy S25 256GB`.
3. Se a leitura direta falhar, a extensão abre a aba sozinha. Aguarde até cerca de 30 s.
4. Se aparecer **Ação necessária**, clique em **Ir para a aba do ML**, resolva a verificação e clique em **Ler aba do ML**.
5. Com resultados, veja no resumo a linha "Fonte: … estratégia …" e confira se 3 anúncios abrem a página certa, com o mesmo título e preço.
6. Se falhar, clique em **Copiar diagnóstico** e envie o JSON junto com a mensagem exibida.

## 10. Limitações conhecidas
- **Coleta real ainda não confirmada**: o ML bloqueia (403, "Hubo un error") o servidor de desenvolvimento, inclusive numa aba do Chromium. As estratégias `json` e `dom` usam o formato conhecido das páginas do ML e foram testadas só com HTML sintético. O diagnóstico existe para fechar essa lacuna com dados do seu navegador.
- A leitura pela aba abre uma aba em segundo plano por alguns segundos.
- A leitura da página pública depende do HTML do ML e pode quebrar se o layout mudar.
- A equivalência é heurística, baseada no texto do título. Não diferencia cores nem modelos sem marcador no título, e pode errar em títulos incomuns.
- O frete pago geralmente não é informado na listagem, então o total com frete pago fica desconhecido (`*`).
- Itens acompanhados só têm o preço atualizado quando aparecem numa busca. Não há atualização automática em segundo plano.
- Produto de catálogo (`/p/MLB…`) sem `wid` agrupa vendedores: o histórico registra o preço exibido, que pode ser de vendedores diferentes ao longo do tempo.

## Estrutura
```
manifest.json        MV3
background.js        menu de contexto
app.html/css/js      interface (popup e aba)
lib/mercadolivre.js  busca (API oficial + leitura direta) e mensagens de falha
lib/ml-parser.js     leitor de anúncios (json/dom/links) + diagnóstico; script clássico, também injetado na aba
lib/tab-reader.js    busca pela aba do navegador (chrome.tabs + chrome.scripting)
lib/analyzer.js      equivalência, comparação e classificação
lib/storage.js       histórico em chrome.storage.local (com poda)
tests/               unitários (node --test) e e2e (Playwright, rede simulada; tab.e2e com servidor HTTPS local)
```
