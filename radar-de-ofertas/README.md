# Radar de Ofertas — caçador automático de promoções (v0.5.1)

Extensão do Google Chrome (Manifest V3, JavaScript puro, sem backend e sem serviços pagos) que **descobre automaticamente** ofertas no Mercado Livre por categoria, registra os preços observados, **pontua as oportunidades** e gera um texto pronto para divulgar em grupos de promoções.

Você não precisa saber qual produto procurar: clique em **Iniciar Radar**.

---

## 1. Instalação
1. Descompacte o ZIP numa pasta. Se já tinha uma versão anterior, remova-a em `chrome://extensions`.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Fixe o ícone. **O clique no ícone abre o painel numa aba**: não existe mais popup.
5. Antes da primeira varredura, abra https://www.mercadolivre.com.br numa aba normal. Se aparecer verificação de segurança, conclua.

## 2. Uso
| Onde | O quê |
|---|---|
| **Iniciar Radar / Atualizar** (topo) | Varre as fontes de ofertas, levando cerca de 1 minuto com 1 página por categoria. A varredura roda em segundo plano, então você pode fechar o painel. |
| **Radar automático** | As 30 melhores oportunidades, as configurações e o resultado de cada fonte da última varredura. |
| **Todas as ofertas / Eletrônicos / Casa e cozinha / Moda / Beleza / Outras categorias** | Listas filtráveis. |
| **Copiar oferta** | Copia um texto pronto para WhatsApp/Telegram (ver §6). |
| ☆ / ★ | Favoritar. Os favoritos ficam na aba **Favoritos** e nunca são apagados pela limpeza automática. |
| **Histórico** | Varreduras (com **Copiar diagnóstico**), pesquisas manuais, preços observados (mini-gráfico) e exportar/apagar. |
| **Busca manual** | O comparador da versão anterior, para pesquisar um produto específico. |

**Filtros:** texto, categoria, faixa de preço, desconto mínimo, "só desconto comprovado", frete grátis, condição, qualidade da oportunidade, ocultar acessórios e ordenação (pontuação, desconto, preço ou mais recentes).

**Configurações** (aba Radar automático):
- Monitoramento automático: desligado, 30 min, 1 h, 3 h ou 6 h. Usa `chrome.alarms` e roda enquanto o Chrome estiver aberto. O intervalo mínimo é de 30 min.
- Páginas por categoria: de 1 a 3.
- Usar aba do navegador se a leitura direta falhar: na varredura manual (ligado por padrão) e no monitoramento automático (desligado por padrão, numa janela minimizada).
- Notificar novas oportunidades boas, só no monitoramento automático.

## 3. Fontes de dados
Somente páginas **públicas** do Mercado Livre, consultadas como um navegador comum:

| Fonte | URL | Situação |
|---|---|---|
| Ofertas do dia (todas) | `https://www.mercadolivre.com.br/ofertas` (+ `?page=N`) | Integrada. URL oficial da seção de ofertas. |
| Ofertas até R$ 100 | `…/ofertas?price=0.0-100.0&container_id=MLB779362-1` | Integrada. URL vista na página inicial real do ML. |
| Ofertas por categoria (12) | `…/ofertas?category=<ID>` | Integrada. Os IDs de Ferramentas (MLB263532) e Saúde (MLB264586) foram vistos na página real. Os demais são os IDs públicos conhecidos das categorias do ML Brasil e são conferidos em tempo real pelo resultado de cada fonte. |
| API oficial `api.mercadolibre.com` (busca) | — | **Não usada no radar**: responde HTTP 403 sem autenticação (teste real), e a autenticação exigiria cadastro de aplicativo. Continua sendo tentada na busca manual. |

### Como cada página é lida
1. **Leitura direta**: `fetch` da página e análise do HTML num *offscreen document* (o service worker do MV3 não tem DOM).
2. **Aba do navegador**, se a leitura direta não trouxer anúncios: a página é aberta numa **janela minimizada** reutilizada, carregada normalmente pelo Chrome com a sua sessão, e os anúncios são lidos do DOM. Ao fim, a janela é fechada.
3. Para extrair os anúncios: dados "polycard" embutidos na página (`json`), cards renderizados (`dom`) ou links de anúncio com preço (`links`).

### Limites e proteções (nada é contornado)
- Intervalo de **3 s entre páginas**, poucas páginas por categoria e intervalo mínimo de 30 min no monitoramento.
- Se o ML mostrar **verificação de segurança, login ou bloqueio**, a varredura **para de usar a aba**, registra o motivo e, na varredura manual, deixa a janela aberta com o botão **Ir para a janela do Mercado Livre**. Você resolve lá e clica em **Atualizar**.
- Fontes bloqueadas entram em **pausa de 6 h** no monitoramento automático.
- Se a leitura direta falhar em 3 fontes seguidas sem alternativa, a varredura é interrompida.

### Carregamento dinâmico (v0.5.1)
A página de busca do ML abre com uma **tela de carregamento** (`ui-search-loading-screen`) e só depois monta os anúncios via JavaScript. Um diagnóstico real da v0.5.0 mostrou exatamente isso: HTML de cerca de 988 mil caracteres, 5 blocos de estado "Nordic", tela de carregamento e 0 cards.
- **Leitura direta:** não executa JavaScript, então nesse caso o diagnóstico mostra `carregando` e o Radar passa para a aba. Antes, mesmo assim, ele procura anúncios no estado da página (estratégia `estado`).
- **Leitura na aba:** espera inteligente, sem tempo fixo:
  - um `MutationObserver` reavalia a página logo após cada lote de mudanças, e uma verificação periódica roda a cada 1 s;
  - termina assim que houver anúncios ou um estado final;
  - o limite máximo é de **30 s**.
- **Estados detectados:** `resultados`, `carregando` (ainda na tela de carregamento no limite), `sem-resultados`, `verificacao`, `bloqueio`, `login`, `pagina-de-produto` e `desconhecida`. "Layout desconhecido" só é concluído quando a página **para** de mudar por 5 s sem indicador de carregamento.
- O diagnóstico ganha o bloco `espera`: tempo, número de verificações e de mutações, quadros de animação, visibilidade da aba, tempo com tela de carregamento e estado final.
- **Aba em segundo plano:** o Chrome pode pausar a montagem da página.
  - Na **busca manual**, se a página ficar carregando com a aba oculta, aparece **Ir para a aba do ML**. Quando os anúncios aparecerem, clique em **Ler aba do ML**.
  - Na **varredura manual do radar**, a fonte é tentada **uma vez** numa janela normal sem foco.
  - O monitoramento automático usa só a janela minimizada.

## 4. Dados coletados por oferta
Título, preço atual, preço "de" anunciado (se houver), imagem (só do CDN `mlstatic.com`), vendedor/loja, se é **loja oficial**, avaliação (quando o card mostra), selos do ML (oferta do dia, relâmpago, mais vendido), frete grátis, condição, link e categoria.
- **Sem duplicados**: o mesmo anúncio visto em várias fontes vira uma oferta só. A categoria vem da página de categoria (ou, na página geral, é inferida pelo título).
- Ofertas não vistas há 3 dias saem do painel. O histórico de preços fica até 5.000 anúncios.

## 5. Inteligência de preços, equivalência e pontuação (v0.5)

### 5.1 Produtos equivalentes
O título vira uma ficha: **marca, modelo, versão** (Pro, Max, Ultra, Plus, FE, Edge…), **capacidade** (armazenamento; a RAM é separada), **tamanho/medida** (polegadas, L, ml, kg, g, W, BTU), **quantidade** (kit 2, 3 unidades), **condição** e **acessório × produto principal**. Cor e palavras de marketing são ignoradas.
- Com marca e modelo identificados, só são equivalentes os anúncios com a **mesma ficha**.
- Sem modelo claro, a semelhança de títulos precisa ser muito alta (≥ 80%) e marca, capacidade, tamanho, quantidade e condição precisam ser iguais. Na dúvida, o Radar **não agrupa**.
- Um anúncio nunca é comparado consigo mesmo, e o mesmo ID visto em várias páginas vira uma oferta só.

### 5.2 Atratividade do preço (independente do desconto)
Usa só referências **observadas**: a mediana dos equivalentes encontrados e a média do histórico do próprio anúncio. Sem referência, aparece **"sem referência"**, nunca um número inventado. A confiança cresce com o número de equivalentes (8 ou mais = plena) e de dias de histórico. Frete desconhecido reduz levemente a confiança.

| Sinal de preço | Regra |
|---|---|
| **Desconto comprovado** | ≥ 3% abaixo da média observada do próprio anúncio (histórico de ≥ 2 dias). |
| **Preço excepcionalmente baixo** | ≥ 25% abaixo da mediana de **≥ 4** equivalentes, ou ≥ 10% abaixo do menor preço já visto (≥ 3 dias). |
| **Preço competitivo** | ≥ 8% abaixo da mediana de ≥ 3 equivalentes. |
| **Desconto anunciado** | "De/por" da loja, coerente com o observado. **Não é comprovação.** |
| **Desconto artificial** | Preço "de" nunca observado no histórico; "de" ≥ 60% acima do que equivalentes custam; ou ≥ 70% OFF sem histórico nem equivalentes. |
| **Preço anômalo** | > 60% abaixo de equivalentes: provável outro produto, peça ou anúncio irregular. |
| **Oportunidade não confirmada** | Há desconto anunciado, mas nenhuma referência para confirmar. |
| **Acima do mercado** | ≥ 15% acima da mediana dos equivalentes. |

### 5.3 Pontuação 0–100 (pesos configuráveis)
A nota é a média ponderada de 6 subnotas. Os pesos ficam em **Radar automático → Pesos da pontuação** e podem ser restaurados ao padrão.

| Subnota | Peso padrão | Como é calculada |
|---|---|---|
| Atratividade do preço | 35 | §5.2 (0 se não houver referência ou se for suspeita) |
| Desconto comprovado | 30 | Proporcional ao desconto comprovado (25% ou mais = máximo); 0 sem histórico |
| Desconto anunciado | 10 | Proporcional ao % anunciado (50% ou mais = máximo); 0 se for artificial |
| Vendedor | 10 | Base + loja oficial + avaliação do produto |
| Frete | 8 | Grátis = 100; pago e informado = 50; desconhecido = 20 |
| Condição | 7 | Novo = 100; usado/recondicionado = 0 |

Ofertas suspeitas têm nota máxima de 30. Cada card mostra a nota, as subnotas de preço e de comprovação e o motivo de cada sinal em **Por quê?**.

### 5.4 Classificação de promoção (rótulo)
| Rótulo | Regra |
|---|---|
| **Excelente oportunidade** | **Desconto comprovado ≥ 10%** e preço não acima do mercado. |
| **Boa oportunidade** | Desconto comprovado ≥ 3%, **ou** desconto anunciado ≥ 20% coerente e não acima do mercado. |
| **Sem promoção confirmada** | Sem desconto comprovado ou anunciado coerente. **Um produto barato sem desconto fica aqui**, e o preço baixo aparece no sinal de preço. |
| **Desconto suspeito** | Desconto artificial ou preço anômalo. Nenhum desconto é exibido ou divulgado. |

## 6. Texto "Copiar oferta"
```
🔥 Smartphone Samsung Galaxy A15 128GB Azul

💰 R$ 899,00 · Frete grátis 🚚
🏷️ De R$ 1.299,00 por R$ 899,00 (31% OFF anunciado pela loja)
🏪 Samsung (loja oficial)

👉 https://produto.mercadolivre.com.br/MLB-…

_Preço e disponibilidade sujeitos a alteração._
```
Com desconto comprovado, a linha passa a ser "📉 X% abaixo do preço médio que acompanhamos (R$ …)". Com preço competitivo ou excepcional e pelo menos 4 equivalentes, entra "📊 X% abaixo da mediana de N anúncios equivalentes que encontramos". O link sai **limpo**, sem parâmetros de rastreamento. O exemplo acima é ilustrativo.

## 6.1 Auditoria e prioridade das fontes (v0.5)
- Cada varredura registra, por fonte: anúncios lidos, **únicos** (não trazidos por fonte anterior da mesma varredura), **novos** (nunca vistos pelo Radar) e acessórios. O acumulado aparece em **Histórico → Auditoria das fontes**.
- **Ordem de consulta:** primeiro a página geral, depois as fontes com mais anúncios únicos por consulta. Fontes nunca lidas ganham uma chance.
- **Páginas 2 e 3** só são consultadas se a página anterior trouxe pelo menos 20 anúncios e pelo menos 40% deles eram únicos. Caso contrário, a página é pulada sem requisição.
- **No monitoramento automático**, uma fonte sem anúncios em 3 varreduras seguidas é pulada por 24 h.
- Nada disso aumenta o número de requisições: só evita as inúteis.

## 6.2 Armazenamento (v0.5)
- **Auditoria:** a poda anterior limitava só a quantidade (5.000 históricos × 120 pontos). No pior caso isso dava cerca de 29 MB, acima da cota de 10 MB do `chrome.storage.local`, e as gravações falhariam.
- **Poda por espaço:** usa o espaço real ocupado. Começa em **70% da cota** e reduz até 55%, nesta ordem:
  1. pontos de preço com mais de 14 dias viram 1 por dia (o último observado);
  2. apagam-se os diagnósticos de varreduras antigas (os das 5 últimas ficam);
  3. saem as ofertas não vistas há mais de 24 h (o histórico delas fica);
  4. ficam só as 50 pesquisas manuais mais recentes;
  5. saem os históricos menos recentes, primeiro os que não estão no painel.
- **Nunca são apagados:** favoritos, configurações e estatísticas de fontes.
- Os pontos de preço não guardam mais o "total" quando ele é igual ao preço.
- O uso atual e a última poda aparecem em **Histórico → Armazenamento**.

## 7. Permissões (Manifest V3)
| Permissão | Motivo |
|---|---|
| `storage` | Ofertas, histórico de preços, favoritos, varreduras e configurações (tudo local). |
| `alarms` | Monitoramento periódico. |
| `offscreen` | Analisar o HTML das páginas fora do service worker (`DOM_PARSER`). |
| `scripting` | Injetar o leitor (`lib/ml-parser.js`, só leitura) **apenas** nas páginas do ML abertas pela varredura ou pela busca manual. |
| `notifications` | Avisar sobre novas oportunidades boas no monitoramento. |
| `contextMenus` | "Buscar no Radar de Ofertas" no botão direito (busca manual). |
| host: `www.mercadolivre.com.br`, `lista.mercadolivre.com.br`, `api.mercadolibre.com` | Ler as páginas de ofertas e de busca. |

Sem `<all_urls>`, sem `tabs` e sem `webRequest`. Nenhum dado sai do navegador.

## 8. Testes
```bash
cd radar-de-ofertas
npm test                 # testes unitários: preços, equivalência, pontuação, pesos, fontes, poda, duplicados, busca manual
npm run test:e2e:radar   # radar completo no Chromium
npm run test:e2e         # busca manual
npm run test:e2e:tab     # leitura pela aba (busca manual)
npm run test:e2e:loading # v0.5.1: carregamento dinâmico (tela de carregamento, atrasos, nunca carrega, bloqueio, sem resultados, verificação, layout desconhecido, estado Nordic)
```
Os testes e2e usam **rede simulada com páginas sintéticas** (servidor HTTPS local). **Eles não provam que a coleta funciona no site real.**

### Teste real (no seu Chrome)
1. Instale a v0.4.0 e abra mercadolivre.com.br numa aba.
2. Clique no ícone e depois em **Iniciar Radar**. Acompanhe "Fontes da última varredura": ✅ = anúncios lidos, ⚪ = página sem anúncios, ⛔ = bloqueio/verificação, ⚠️ = erro.
3. Abra 3 ofertas e confira se título, preço e loja batem com a página do anúncio.
4. Confira se a categoria das ofertas faz sentido (ex.: aba Moda).
5. Se algo falhar, vá em **Histórico → Varreduras → Copiar diagnóstico** e envie o JSON. Ele traz, por fonte: tipo de página, estratégia, contagens e classes CSS, sem dados pessoais.

## 9. Limitações
- **A coleta ainda não foi confirmada com o site real:** o ML bloqueia o servidor de desenvolvimento (HTTP 403). Na v0.3, a busca manual do usuário leu 48 anúncios reais, o que indica que o leitor funciona no navegador real. As páginas `/ofertas` usam os mesmos cards, mas não foram vistas a partir daqui.
- Os IDs de categoria (exceto Ferramentas e Saúde) não foram conferidos com a página real. Se um deles estiver errado, a fonte mostrará anúncios gerais ou nenhum.
- A reputação do vendedor (MercadoLíder, vendas) não aparece nos cards de oferta. Só "loja oficial" e a avaliação do produto são usadas.
- O frete pago geralmente não é informado na lista, então só "frete grátis" pesa.
- O desconto comprovado depende do histórico acumulado pelo Radar (≥ 2 dias).
- O agrupamento de equivalentes e a detecção de acessórios são heurísticos, baseados no título. A lista de marcas é fixa (cerca de 150). Marcas fora dela ficam "sem marca", e esses produtos só se agrupam com títulos quase idênticos.
- A atratividade do preço depende de haver equivalentes na mesma varredura ou no painel. Produtos únicos ficam "sem referência".
- O monitoramento só roda com o Chrome aberto. Com leitura por aba no modo automático, uma janela minimizada aparece rapidamente.

## Estrutura
```
manifest.json         MV3 (ícone abre o painel)
background.js         service worker: comandos, alarmes, notificações, menu de contexto
offscreen.html/js     leitura direta + DOMParser fora do service worker
app.html/css          painel
panel.js              radar, listas por categoria, filtros, copiar oferta, favoritos, varreduras
app.js                abas, busca manual, histórico, favoritos
lib/categories.js     categorias, palavras-chave e fontes
lib/discovery.js      motor de descoberta (fontes, leitura direta/aba, limites, pausas)
lib/product.js        ficha do produto (marca, modelo, versão, capacidade, tamanho, quantidade, condição, acessório) e equivalência
lib/pricing.js        atratividade do preço e sinais (comprovado, anunciado, competitivo, excepcional, artificial, anômalo, não confirmada)
lib/scoring.js        pontuação com pesos configuráveis, rótulos e texto de divulgação
lib/ml-parser.js      leitor de anúncios (json/dom/links) + diagnóstico; também injetado nas abas
lib/storage.js        ofertas, histórico, favoritos, varreduras, configurações
lib/analyzer.js       equivalência e classificação da busca manual
lib/mercadolivre.js   busca manual (API + leitura direta)
lib/tab-reader.js     busca manual pela aba
tests/                unitários (node --test) e e2e (Playwright, rede simulada)
```
