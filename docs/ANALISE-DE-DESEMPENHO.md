# Análise de desempenho — versão 4.15

## Melhorias aplicadas

1. **Carregamento por área:** cada tela é carregada quando aberta.
2. **Planilhas sob demanda:** a biblioteca de planilhas é carregada somente quando uma importação é iniciada.
3. **Fotos das Amostras:** as fotos 2 e 3 são consultadas sob demanda para cartões visíveis; ao abrir a galeria, o conjunto completo é entregue ao visualizador.
4. **Visualizador:** a imagem ativa é exibida em tela cheia; controles e gestos mudam apenas o índice atual, sem buscar outras OCs.
5. **Logo:** imagem WebP otimizada, usada também na tela animada de carregamento.

## Cuidados

- As galerias continuam limitadas a três imagens por OC.
- A navegação por gesto ignora campos de formulário, botões, menus horizontais e a própria galeria de fotos para não conflitar com o uso normal.
- As áreas continuam respeitando as permissões de cada usuário.
- As credenciais e regras existentes foram preservadas.
