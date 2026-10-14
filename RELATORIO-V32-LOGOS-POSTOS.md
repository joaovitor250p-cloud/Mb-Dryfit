# Pacote É Mato — V32 — Logos reais nos postos

## Objetivo
Substituir os círculos com letras (S, IP, BR, ALE, E, T) usados na V31 por marcas visuais reconhecíveis dos postos de combustível.

## Alterações
- `js/mapa/postos.js`
  - removeu a geração dos ícones por iniciais;
  - os postos passam a usar marcadores geográficos nativos do MapLibre (`maplibregl.Marker`) sem qualquer deslocamento manual de latitude/longitude;
  - Shell usa o símbolo da concha;
  - Ipiranga, Petrobras/BR, ALE, Esso e Texaco usam seus logotipos quando a bandeira é identificada pelos dados públicos;
  - posto sem bandeira identificada continua usando o símbolo genérico de combustível;
  - se um logotipo externo não carregar, o marcador cai automaticamente para o símbolo genérico `⛽` em vez de mostrar uma letra incorreta;
  - os logotipos também aparecem no card de detalhes do posto.

- `css/postos.css`
  - novo tratamento visual dos logos no mapa e no card;
  - marcador compacto (42–44 px), sem alterar a coordenada do posto;
  - Shell recebe fundo amarelo para melhorar a leitura do símbolo;
  - os demais logos usam fundo branco e proporção preservada.

- `index.html`
  - cache atualizado de V31 para V32.

## Fontes visuais
Os logos são carregados somente para identificar a bandeira do posto. O módulo utiliza o símbolo Shell via Simple Icons e logos de Ipiranga, Petrobras, ALE, Esso e Texaco por redirecionamento de arquivos do Wikimedia Commons. Marcas e logotipos continuam pertencendo aos respectivos titulares.

## Comportamento de fallback
O recurso de postos já depende de internet para consultar o Overpass/OpenStreetMap. Mesmo assim, se um servidor de logo falhar ou a bandeira não estiver cadastrada, a busca de postos continua funcionando e o app exibe `⛽` como fallback.

## Testes executados
- `node --check` em todos os arquivos JavaScript do projeto: aprovado.
- Remoção do antigo gerador por letras: confirmada.
- Cache do `index.html`: todas as referências V32.
- Verificação de sintaxe e metadados das seis bandeiras: aprovada.
- Postos genéricos continuam com fallback próprio.

## Validação manual necessária
- Conferir no celular o carregamento visual dos logos com internet real.
- Conferir a disponibilidade dos servidores de imagens na rede da operadora.
- Conferir marcas cadastradas de forma incompleta no OpenStreetMap; nesses casos o app não inventa bandeira e usa o ícone genérico.
