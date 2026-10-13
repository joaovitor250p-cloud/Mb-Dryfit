# V24 — Importação rápida e numeração somente após otimização

## Alterações

- A importação XLSX/CSV não dispara mais geocodificação em massa imediatamente após carregar o arquivo.
- Paradas sem coordenadas ficam pendentes e são geocodificadas somente quando o usuário toca em **Otimizar rota**.
- Coordenadas fornecidas pelo XLSX continuam preservadas na importação e são validadas contra o endereço somente na otimização.
- Antes da otimização, os marcadores do mapa aparecem como pontos compactos sem número.
- A lista de paradas e o card flutuante também não exibem número de sequência antes da otimização.
- Após uma otimização concluída com sucesso, a numeração oficial passa a aparecer no mapa, na lista e no card.
- Se a rota for alterada e precisar ser otimizada novamente, a numeração volta a ficar oculta até a próxima otimização concluída.

## Motivo da lentidão

A versão anterior podia iniciar dezenas de consultas de geocodificação logo após a importação quando a planilha não trazia coordenadas. Como o geocodificador trabalha de forma controlada e sequencial, uma planilha grande podia permanecer em processamento por muito tempo. A V24 separa claramente as etapas: **importar primeiro; localizar/validar/otimizar depois**.

## Arquivos alterados

- `js/roteirizacao/roteirizacao.js`
- `js/mapa/mapa.js`
- `js/mapa/marcadores.js`
- `css/roteirizacao.css`
- `index.html`

## Fluxo novo

1. Importar XLSX/CSV.
2. Mostrar imediatamente as paradas já carregadas.
3. Sem numeração oficial nessa etapa.
4. Ao tocar em **Otimizar rota**, localizar apenas as paradas sem coordenadas.
5. Validar coordenadas importadas quando necessário.
6. Calcular a sequência pela rede viária.
7. Somente após sucesso, exibir 1, 2, 3... nos marcadores/lista/cards.
