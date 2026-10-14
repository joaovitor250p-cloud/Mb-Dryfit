# Pacote É Mato — V29

## Ajustes desta versão

- Aumentado o status `Entregue` no card, com verde mais forte e maior legibilidade.
- Aumentado o status `Não entregue` no card, agora em vermelho, com fundo vermelho-claro e borda discreta.
- Centralizado o `×` do botão circular de voltar usando grid, sem depender do alinhamento da fonte/line-height anterior.
- Retomada da navegação otimizada: um mapa saudável não é mais destruído e recriado ao voltar do segundo plano.
- O mapa só é reconstruído quando o canvas/style/container realmente não está saudável.
- `visibilitychange`, `pageshow`, `focus` e `pemato:resume` agora priorizam resize/repaint/redesenho, evitando tela branca e travamentos por reconstrução desnecessária do WebGL.
- Ao criar o mapa de navegação, o centro inicial vem da posição atual, parada selecionada, próxima parada ou primeira parada válida — não do centro padrão de São Paulo.
- Ao reabrir o aplicativo com navegação operacional ativa, o App Shell prioriza diretamente o módulo `navegacao`, mesmo se o estado visual antigo do shell apontar para outra tela.
- Mantida a lógica da V28 para próxima parada e traçado; não foi recriada essa funcionalidade.

## Validações executadas

- `node --check` em todos os JavaScripts do projeto.
- Auditoria de IDs HTML duplicados.
- Verificação estática de que eventos de retorno não forçam mais reconstrução do mapa saudável.
- Verificação de que o mapa usa centro derivado da rota antes do GPS responder.
- Verificação de cache bust V29.
- Verificação de integridade do ZIP.

## Dependem de validação no aparelho

- Retorno real após Waze/Google Maps e após vários minutos em segundo plano.
- Comportamento do WebView/GPU específico do aparelho.
- Tempo real até o primeiro fix de GPS.
