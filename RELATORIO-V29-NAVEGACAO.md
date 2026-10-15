# V29 — controles, retorno ao mapa e término previsto

- Cabeçalho do cartão em grade: número da parada à esquerda; X e três pontos à direita; status em linha própria, sem sobreposição.
- Status Pendente com fonte maior (1,1 rem).
- Não entregue com fundo vermelho e texto branco, inclusive após aplicação do tema.
- Símbolo original do aplicativo e horário de término previsto no canto direito, abaixo do cartão de instruções. A posição acompanha a altura das instruções e os controles ficam abaixo do horário.
- Navegação inicia na primeira parada pendente com coordenadas válidas; usa outra parada ou a geometria como alternativa antes do centro padrão.
- Retorno ao primeiro plano reutiliza o mapa existente e a rota em memória. Reconstrução apenas quando não há mapa, o canvas foi removido ou houve perda do contexto gráfico. Ao retornar, centraliza na rota sem aguardar GPS.
- Horário usa a previsão calculada pela rota, atualizada quando o trajeto é recalculado ou o status muda; não representa trânsito em tempo real.
- Referências de CSS e JavaScript atualizadas para evitar reutilização de arquivos antigos em cache.

## Verificação
Sintaxe JavaScript validada. Teste automatizado com mapa simulado verificou seleção da próxima parada, formatação do horário, reutilização do mapa e recentralização na rota. A validação visual em navegador e o teste de GPS/retorno em aparelho real continuam necessários: o ambiente de verificação não possui Chromium instalado. Velocidade de tiles depende da conexão e do servidor de mapas.

## Instalação
Substitua os arquivos da versão anterior pelo conteúdo desta pasta no mesmo local de hospedagem. Não limpe os dados do navegador, pois contêm rotas e progresso. Recarregue o aplicativo para receber a versão atualizada.
