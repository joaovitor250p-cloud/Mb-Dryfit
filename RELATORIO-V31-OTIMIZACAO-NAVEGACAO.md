# V31 — comparação viária e câmera de navegação

## Otimização

A distância e o tempo exibidos agora são os do percurso completo que fornece o desenho e as instruções. Não se usa a distância do planejador para substituir a de um trajeto diferente.

São comparados: sequência atual recalculada; sequência do planejador com preferência curta; sequência com preferência equilibrada (e a preferência atual, quando diferente). Para até 60 paradas pendentes, até dois ajustes locais adicionais são avaliados perto de um trecho de maior distância. Cada candidato é calculado integralmente pelas ruas, nos sentidos correspondentes, incluindo destino fixo ou retorno ao início. Não há inversão presumida de distâncias nem atalhos desenhados entre paradas.

Na preferência short, vence a menor distância confirmada e o tempo desempata. Nas demais preferências, a comparação prioriza o tempo calculado e desempata pela distância. Mais curta nem sempre significa mais rápida; o objetivo registrado no resumo permite conferir essa decisão. Uma sequência atual válida participa da comparação para evitar piora do objetivo escolhido.

O perfil de roteamento deriva do veículo selecionado. Mãos únicas e restrições são as representadas na rede do provedor para esse perfil; esta atualização não verifica mudanças de sinalização em tempo real. O tempo continua usando fluxo livre mais atendimento por parada, sem trânsito ao vivo. Não se promete mínimo global ou resultado melhor que Spoke em toda rota.

Coordenadas inválidas, IDs repetidos e métricas inválidas não são aceitos. Se nenhuma alternativa completa puder ser calculada, a rota anterior permanece. Falhas opcionais e resultados dos candidatos ficam em resumoOtimizacao.comparacao. A comparação faz mais chamadas ao serviço e pode demorar mais e consumir mais créditos, especialmente nas rotas grandes segmentadas. O limite de refinamento evita buscas ilimitadas.

## Navegação

Câmera a 58 graus no modo interno, com direção do deslocamento (ou da via quando o GPS não fornece heading), zoom próximo e posição do veículo calculada para ficar acima do painel de entrega. Heading null não é mais convertido em norte.

Arrastar, aplicar zoom, girar ou inclinar manualmente pausa o acompanhamento. Atualizações programáticas não acionam esse estado. Recentralizar aparece somente no modo de exploração; ao tocar, retoma a câmera e desaparece. O retorno do app preserva a exploração manual quando o mapa existente está saudável. Recalcular durante a navegação também mantém o destino final configurado.

## Validação e instalação

Testes simulados: candidato de 18 km contra atual de 20 km; rejeição de alternativa pior; não usar 5 km informados pelo planejador quando o percurso tem 18 km; destino final e perfil; métricas inválidas; falhas sem mutação da rota original; heading ausente; posição visível; pausa por gesto e retorno do acompanhamento. Sintaxe JavaScript e regressão das construções 2D verificadas.

Não foram feitas chamadas de otimização com endereços reais nem validação no aparelho. O teste de campo deve comparar a mesma lista, partida, destino, veículo e horário entre os aplicativos. O navegador de testes não está instalado neste ambiente.

Substitua os arquivos da hospedagem, mantendo os dados locais, e recarregue. Estas mudanças usam os endpoints já existentes e não exigem atualização do Worker.
