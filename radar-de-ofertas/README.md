# Radar de Ofertas — extensão Chrome (MVP v0.2.0)

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

1. **API pública oficial** `api.mercadolibre.com/sites/MLB/search`. Teste real em 20/11/2026: responde **HTTP 403 "forbidden"** sem autenticação. A chamada é mantida porque não custa nada e volta a funcionar se o ML reabrir o acesso.
2. **Página pública de busca** `lista.mercadolivre.com.br/<termo>`: o HTML é lido com `DOMParser` (sem executar scripts) e os cards são extraídos.
3. Se as duas falharem, a extensão mostra o erro de cada fonte. **Nenhum resultado é inventado.**

Mensagens de erro comuns:

| Mensagem | O que fazer |
|---|---|
| `verificação de segurança` / `HTTP 403` | Abra mercadolivre.com.br numa aba, conclua a verificação e tente de novo. Redes de empresa, VPN e servidores podem ser bloqueados. |
| `nenhum anúncio foi reconhecido (o layout do site pode ter mudado)` | O ML mudou o HTML. Os seletores em `lib/mercadolivre.js` (`parseCard`) precisam de ajuste. |
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
| `host_permissions`: `api.mercadolibre.com`, `lista.mercadolivre.com.br`, `www.mercadolivre.com.br` | Buscar resultados (API, página de busca e seu redirecionamento). |

Não usa `tabs`, `scripting`, `<all_urls>` nem content scripts. A CSP só permite scripts da própria extensão e imagens de `*.mlstatic.com`.

## 9. Testes

```bash
cd radar-de-ofertas
npm test            # 21 testes unitários (Node ≥ 18): classificação, equivalência, IDs, links, poda
npm run test:e2e    # 21 verificações com a extensão carregada no Chromium (requer Playwright)
```

`test:e2e` usa **rede simulada** (HTML sintético no formato dos cards do ML). Ele valida a lógica e a interface, mas **não substitui** o teste com o site real, que precisa ser feito manualmente:

### Checklist de teste real (no seu navegador)
1. Busque `iphone 13 128gb`. Devem aparecer anúncios com foto, preço e frete.
2. Abra 3 resultados e confira se o título e o preço da página do anúncio batem com o card.
3. Confira se capas e películas aparecem tracejadas como "Produto diferente da busca?".
4. Marque ★ em um item e veja se ele aparece em **Acompanhando**.
5. No dia seguinte, repita a busca e confira a aba **Histórico** (2 pontos no mini-gráfico).
6. Se algo falhar, anote a mensagem de erro exibida e o termo buscado.

## 10. Limitações conhecidas
- **Sem teste com dados reais ainda**: o ML bloqueia (403) acessos vindos de servidores. Da casa do usuário, o comportamento esperado é diferente, mas não foi verificado.
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
lib/mercadolivre.js  busca (API oficial + página pública), parser e validação de links/imagens
lib/analyzer.js      equivalência, comparação e classificação
lib/storage.js       histórico em chrome.storage.local (com poda)
tests/               unitários (node --test) e e2e (Playwright, rede simulada)
```
