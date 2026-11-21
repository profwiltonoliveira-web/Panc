# Radar de Ofertas — caçador automático de promoções (v0.4.0)

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

## 4. Dados coletados por oferta
Título, preço atual, preço "de" anunciado (se houver), imagem (só do CDN `mlstatic.com`), vendedor/loja, se é **loja oficial**, avaliação (quando o card mostra), selos do ML (oferta do dia, relâmpago, mais vendido), frete grátis, condição, link e categoria.
- **Sem duplicados**: o mesmo anúncio visto em várias fontes vira uma oferta só. A categoria vem da página de categoria (ou, na página geral, é inferida pelo título).
- Ofertas não vistas há 3 dias saem do painel. O histórico de preços fica até 5.000 anúncios.

## 5. Pontuação e classificação
Pontuação de 0 a 100, com o motivo de cada ponto em **Por quê?**:

| Critério | Efeito |
|---|---|
| **Desconto comprovado** (preço atual vs. média observada pelo Radar em ≥ 2 dias anteriores) | até +40, e +5 se for o menor preço já registrado |
| **Desconto anunciado** pela loja (preço "de") | até +18, peso menor por não ser comprovado |
| **Preço frente a anúncios semelhantes** (mesma categoria; título equivalente; acessórios à parte) | até +15. Isso é "preço competitivo", **não** desconto |
| Loja oficial | +8 |
| Avaliação ≥ 4,5 (≥ 10 avaliações) / < 3,8 | +4 / −6 |
| Frete grátis | +7 |
| Usado/recondicionado | −10 |
| Selo "oferta do dia"/"relâmpago" do ML; anúncio com imagem | +3; +2 |

| Classificação | Regra |
|---|---|
| **Excelente oportunidade** | Exige **desconto comprovado ≥ 10%** e pontuação ≥ 40. |
| **Boa oportunidade** | Alguma evidência (comprovado ≥ 3%, anunciado ≥ 20% sem contradição, ou ≥ 20% abaixo de semelhantes) e pontuação ≥ 12. |
| **Preço regular** | Sem evidência de vantagem. |
| **Desconto suspeito** | Preço "de" nunca observado no histórico; "% OFF" ≥ 70% sem histórico; ou preço > 60% abaixo de semelhantes. Ofertas suspeitas **não exibem desconto** e têm pontuação máxima 30. |

**Preço baixo não é tratado como desconto verdadeiro.** Na primeira varredura nada é "Excelente", porque ainda não há histórico. Ative o monitoramento para acumular evidência.

### Acessórios
Títulos que começam com capa, película, carregador, cabo, suporte, pulseira, controle etc., ou que trazem "compatível", são marcados como **acessório**. Eles são comparados só com outros acessórios, e um filtro permite ocultá-los.

## 6. Texto "Copiar oferta"
```
🔥 Smartphone Samsung Galaxy A15 128GB Azul

💰 R$ 899,00 · Frete grátis 🚚
🏷️ De R$ 1.299,00 por R$ 899,00 (31% OFF anunciado pela loja)
🏪 Samsung (loja oficial)

👉 https://produto.mercadolivre.com.br/MLB-…

_Preço e disponibilidade sujeitos a alteração._
```
Com desconto comprovado, a linha passa a ser "📉 X% abaixo do preço médio que acompanhamos (R$ …)". O link sai **limpo**, sem parâmetros de rastreamento. O exemplo acima é ilustrativo.

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
npm test                 # testes unitários: pontuação, acessórios, agrupamento, categorias, fontes, texto, busca manual
npm run test:e2e:radar   # radar completo no Chromium
npm run test:e2e         # busca manual
npm run test:e2e:tab     # leitura pela aba (busca manual)
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
- O agrupamento de equivalentes e a detecção de acessórios são heurísticos, baseados no título.
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
lib/scoring.js        pontuação, acessórios, agrupamento, texto de divulgação
lib/ml-parser.js      leitor de anúncios (json/dom/links) + diagnóstico; também injetado nas abas
lib/storage.js        ofertas, histórico, favoritos, varreduras, configurações
lib/analyzer.js       equivalência e classificação da busca manual
lib/mercadolivre.js   busca manual (API + leitura direta)
lib/tab-reader.js     busca manual pela aba
tests/                unitários (node --test) e e2e (Playwright, rede simulada)
```
