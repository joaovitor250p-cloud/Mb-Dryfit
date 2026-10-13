# Pacote É Mato — V16

Base utilizada: V15.

## Correções desta versão

### 1. Mapa branco
- O mapa de navegação não coloca mais uma camada branca sobre o mapa por causa de qualquer erro isolado de tile, sprite ou rede.
- O aviso de indisponibilidade só aparece quando o mapa realmente não consegue inicializar.
- Tanto o mapa de planejamento quanto o de navegação passam a trocar automaticamente para o estilo raster de contingência quando a base vetorial falha repetidamente na inicialização.
- O fallback é acionado mais cedo e o mapa é redimensionado/repintado ao ficar pronto.
- Foram retiradas da criação do mapa opções experimentais adicionadas na V15 (`antialias`, `renderWorldCopies: false` e `fadeDuration: 0`), voltando a uma configuração mais conservadora.
- A área do mapa usa fundo neutro cinza-claro durante carregamento, em vez de parecer uma tela branca do aplicativo.

### 2. Entregue / Não entregue sem “Desfazer”
- A barra “Desfazer” da última parada foi removida.
- O botão “Desfazer status” também foi removido da navegação.
- Ao marcar Entregue ou Não entregue, o fluxo continua avançando diretamente para a próxima parada pendente.
- O status permanece gravado e visível quando a parada concluída é consultada, mas não gera controles de desfazer nas paradas seguintes.

### 3. Menu dos três pontos
- O menu dos três pontos da navegação agora utiliza o mesmo componente visual do menu dos três pontos da tela de rotas/roteirização.
- Foram reutilizadas as classes `routing-actions-backdrop`, `routing-actions-menu`, `routing-actions-head`, `routing-action-list` e `routing-action-row`.
- As ações agora aparecem em linhas com ícone, título e descrição, no mesmo padrão da tela de rotas.
- IDs e eventos das ações foram preservados para não quebrar a lógica existente.

## Arquivos alterados
- `index.html`
- `js/navegacao/navegacao.js`
- `js/mapa/mapa.js`
- `css/theme-v15.css` (arquivo preservado; recebeu os ajustes V16)
- `README.md`

## Testes executados no ambiente
- `node --check` em todos os JavaScripts do projeto.
- Verificação de IDs duplicados no `index.html`.
- Verificação de ausência dos elementos de interface `navUndoStatusBtn`, `navLastUndoBtn`, `navLastStatusBar` e `navStatusActions`.
- Verificação de que o menu da navegação usa as mesmas classes estruturais do menu da roteirização.
- Verificação estrutural do fallback de mapa nos dois módulos.
- Validação do ZIP após geração.

## Validação que ainda depende do aparelho
- Carregamento real dos tiles na rede do celular.
- Troca real para o mapa raster caso o provedor vetorial falhe.
- Retorno de Waze/Google Maps em Android/iOS.
- Aparência final do menu e do mapa em diferentes aparelhos/GPU.
