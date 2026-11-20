# Radar de Ofertas — extensão Chrome (MVP)

Busca produtos no Mercado Livre, compara preços (incluindo frete quando informado), classifica as ofertas e guarda um histórico local de preços. Sem backend, sem APIs pagas: tudo roda no navegador e os dados ficam em `chrome.storage.local`.

## Instalar (modo desenvolvedor)
1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta (`radar-de-ofertas/`).
4. Fixe o ícone na barra e clique para abrir. "⤢ Tela cheia" abre a mesma interface em uma aba.
5. Atalho: selecione um texto em qualquer site → botão direito → **Buscar "…" no Radar de Ofertas**.

## Funcionalidades
- **Busca**: tenta a API pública oficial do ML (`api.mercadolibre.com/sites/MLB/search`); se ela recusar (desde 2025 costuma exigir autenticação → HTTP 401/403), lê a página pública `lista.mercadolivre.com.br`. Se as duas falharem, mostra o erro de cada fonte — **nenhum resultado é inventado**. Se o ML pedir captcha, abra o site numa aba, conclua a verificação e busque de novo.
- **Comparador**: ordena por preço total (preço + frete conhecido), mostra % vs. o mais barato e vs. a mediana, faixa de preços, filtros (frete grátis, novos, classificação) e ordenação. Anúncios < 40% da mediana (acessórios, peças) não são usados como referência de "mais barato".
- **Detector de promoções** (com motivo e nível de confiança em "Por quê?"):
  - **Excelente oportunidade** — só com histórico: menor preço já registrado e ≥10% abaixo da média histórica.
  - **Boa oportunidade** — ≥3% abaixo da média histórica; ou, sem histórico, ≥20% abaixo da mediana da busca (confiança baixa).
  - **Preço regular** — dentro/acima da faixa.
  - **Desconto suspeito** — preço "de" nunca observado no histórico; "% OFF" mas já visto mais barato; desconto ≥50% sem histórico; ou preço >60% abaixo da mediana.
  - Sem histórico, a extensão **nunca** afirma que um desconto é real.
- **Histórico**: pesquisas recentes (clique para repetir), preços observados por anúncio com mini-gráfico, exportar JSON, apagar tudo. No máximo 1 ponto por anúncio por hora.
- **Acompanhando**: marque ★ para seguir um anúncio e ver a variação desde que marcou. Os preços atualizam a cada busca que traga o anúncio.

## Limitações conhecidas
- O histórico começa vazio: as classificações ficam mais confiáveis conforme você repete buscas em dias diferentes.
- A leitura da página pública depende do HTML do Mercado Livre; se o layout mudar, os seletores em `lib/mercadolivre.js` (`parseSearchHtml`) precisam de ajuste.
- Frete só é considerado quando o anúncio informa (normalmente "Frete grátis"); total sem frete conhecido aparece com `*`.

## Testes
```bash
cd radar-de-ofertas && npm test
```

## Estrutura
```
manifest.json      MV3
background.js      menu de contexto
app.html/css/js    interface (popup e aba)
lib/mercadolivre.js  busca (API oficial + página pública) e normalização
lib/analyzer.js      comparação e classificação
lib/storage.js       histórico em chrome.storage.local
tests/               testes (node --test)
```
