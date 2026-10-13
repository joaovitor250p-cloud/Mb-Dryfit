# Pacote É Mato — V21 — correção do pós-entrega e limpeza técnica

## Bug corrigido

Na V20, `js/navegacao/navegacao.js` passou a chamar `distanciaMetros(...)` dentro da normalização visual da geometria, mas essa função não existia nesse módulo. O erro aparecia principalmente após Entregue/Não entregue, quando a rota era persistida/recalculada e redesenhada.

A V21 remove essa referência inválida e reutiliza `haversine(...)`, que já era a função oficial de distância dentro do módulo de navegação.

## Limpeza executada

A varredura foi conservadora: somente código comprovadamente morto, vazio ou duplicado foi removido.

- removidas variáveis `mapaCriadoEm` e `errosMapaIniciais`, nunca lidas;
- removidos nomes/funções antigos de cluster nos mapas de planejamento e navegação; o clustering já estava desativado;
- removidos `SOURCE_NEXT`, `LAYER_NEXT` e `LAYER_NEXT_TEXT` da navegação, pois o source era sempre alimentado com coleção vazia e o destaque da próxima parada já é feito pelo marcador numerado;
- removida a função no-op `garantirImagemBalao()` do mapa de planejamento;
- removida a função/exportação `irParaProximaPendente`, que ficou sem interface e sem consumidores depois do avanço automático;
- centralizadas em `js/mapa/marcadores.js` as rotinas repetidas de quantidade de pacotes e chave física do marcador, reutilizadas agora por `mapa.js` e `navegacao.js`;
- mantidos os parsers/fluxos de compatibilidade do `app.js`: há trechos parecidos, mas eles atendem caminhos de importação diferentes e removê-los sem uma suíte de PDFs reais seria uma mudança de risco.

## Testes executados

- `node --check` em todos os arquivos JavaScript do projeto: aprovado;
- verificação TypeScript `checkJs` focada em `navegacao.js`: nenhuma referência bare/indefinida (`TS2304`) após a correção;
- busca global por `distanciaMetros`: nenhuma referência restante;
- busca global pelos antigos artefatos de cluster removidos: nenhuma referência restante;
- validação de IDs duplicados no HTML: nenhum ID duplicado;
- validação de `<script src>` e stylesheets duplicados: nenhum carregamento duplicado;
- teste dos helpers compartilhados de marcador com endereço/número e múltiplos pacotes: aprovado;
- ZIP validado após criação.

## Preservado

Não foram reescritos login, Firebase, importação, bipagem, operações de adicionar/remover pacotes, persistência, geocodificação, serviço de rota, Waze/Maps, histórico ou estados de entrega.

O Desfazer continua contextual no card de uma parada já finalizada.

## Validação que ainda depende do celular

- marcar várias paradas como Entregue/Não entregue numa rota real;
- confirmar que o recálculo não exibe mais o erro;
- retorno de Waze/Maps;
- comportamento visual do MapLibre/WebView no aparelho.

## Limpeza adicional da interface/código legado

Durante a varredura também foram encontrados três blocos CSS gravados com caracteres literais `\\n` em vez de quebras de linha reais. Esses trechos vinham de patches antigos e não eram CSS válido. Eles foram normalizados/removidos de forma conservadora:

- `css/navegacao.css`: removidas regras antigas do painel arrastável/lista interna que já não existe; mantidas apenas regras atuais de status/localização/seletor de pacotes;
- `css/operacoes-pacotes.css`: bloco do modo separado de Adicionar/Remover foi regravado em CSS válido;
- `css/roteirizacao.css`: bloco de busca de endereço e seletor de pacotes foi regravado em CSS válido.

Também foram removidas referências JavaScript a elementos que já não existem no HTML:

- `navStopsOverviewList` / `navStopsOverviewMeta`;
- `routingFitMapBtn`.

Depois da limpeza, `mapa.js` e `navegacao.js` não possuem mais referências `$('<id>')` para IDs inexistentes no `index.html`.
