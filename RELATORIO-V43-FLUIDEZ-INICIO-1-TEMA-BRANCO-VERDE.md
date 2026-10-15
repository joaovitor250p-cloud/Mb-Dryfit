# V43 — Fluidez, início na parada 1 e identidade branco/verde

- Corrige a seleção após otimização: toda nova rota começa na primeira parada da nova ordem calculada.
- Limpa seleção externa antiga para impedir abertura em paradas como 6/15 após nova importação.
- Swipe dos cards foi aliviado: sem reconstrução dos marcadores a cada card, persistência com debounce e animação via Web Animations.
- Movimento do mapa ao navegar pelos cards foi encurtado e interrompe animação anterior antes de iniciar a próxima.
- Repaginação visual global baseada em branco e verde, com preto apenas para texto/contraste.
- Diálogos próprios agora usam superfície branca e ações verdes, melhorando legibilidade.
- Botões Nova rota e Adicionar ao mesmo mapa permanecem na ordem solicitada e com o mesmo tratamento verde.
