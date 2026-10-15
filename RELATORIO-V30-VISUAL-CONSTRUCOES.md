# V30 — término compacto, controles e construções

- Cartão de término com símbolo de 24 px, horário de 16 px e espaçamento menor, mantendo posição abaixo das instruções.
- X e três pontos substituídos por SVG de 16 px, centralizados em círculos de 34 px. Rótulos de acessibilidade e ações preservados.
- Construções em 2D: preenchimento claro e contornos cinza, visíveis a partir do zoom 14 e com mais contraste no zoom 16.
- Aplicação nos mapas de roteirização e navegação, usando a fonte de construções do estilo vetorial carregado, sem serviço adicional.
- A representação em 3D é substituída pelos contornos em 2D. Ruas, rótulos e rota são preservados.
- Cobertura depende dos dados da base atual. Não há promessa de cobertura igual à do Google/Spoke. O mapa raster de contingência mantém o desenho fornecido pelo seu servidor.

Verificações: sintaxe dos três arquivos JavaScript, testes simulados de construções, repetição de carregamento, troca de estilo, fallback raster e regressão do retorno à rota. Ícones e versão de cache verificados. Não foi possível validar em navegador ou com tiles reais neste ambiente; conferir no celular após atualizar a hospedagem.

Instalação: substituir a pasta do app na hospedagem e recarregar. Não apagar os dados locais do navegador, que guardam rotas e progresso.
