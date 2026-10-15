# V32 — paradas independentes, menu e veículos

## Entregas no mesmo local
Cada parada com ID próprio tem seu marcador, número, pacotes e status. Paradas com coordenadas iguais não são mais representadas por um único balão. Os símbolos recebem afastamento visual, sem alterar as coordenadas usadas na rota. Entregar ou não entregar afeta somente o ID selecionado. O deslize do cartão destaca o marcador correspondente e pausa o acompanhamento para que o GPS não tire a seleção de vista. Notas da parada anterior são preservadas no deslize.

Uma parada que já contém vários pacotes continua sendo uma parada; não são inventados novos endereços ou divididos registros sem identidade própria. Entregas já registradas anteriormente não são desfeitas automaticamente.

## Menu
Novo cabeçalho com símbolo, ícones, textos auxiliares, destaque da página atual, botão de fechar e área de suporte. Ordem: Minha rota, Configurações, Histórico. Tutorial em vídeo, convite inicial e disparo automático removidos.

## Troca de navegação e configurações
Trocar apenas Pacote É Mato/Waze/Google Maps não altera a geometria, ponto inicial, sequência, status ou seleção da rota. Ao sair da navegação, a seleção é salva antes da troca de tela. Configurações relevantes carregam a versão mais recente da rota, evitando sobrescrever entregas com uma cópia antiga. Aplicações são serializadas e a troca de tela aguarda sua conclusão.

Os aplicativos externos recebem o destino selecionado e calculam seu próprio trecho. Não é possível impor a eles a geometria exata do Pacote É Mato ou reconhecer automaticamente uma entrega realizada externamente. A ordem e o progresso ficam preservados no Pacote É Mato.

## Veículos
Carro → drive; moto → motorcycle; caminhão leve → light_truck; caminhão → truck. O perfil é usado tanto no planejador quanto no cálculo dos percursos. Ao mudar o veículo, o app compara rotas para as paradas restantes. Se o cálculo falhar, mantém os status e exige recalcular antes de navegar com o novo perfil.

O antigo perfil Caminhão era light_truck. Rotas antigas desse tipo são sinalizadas para recálculo antes de usar o perfil truck. Os perfis do provedor têm limites padrão: leve até 3,5 t/3,2 m; caminhão até 22 t/4,1 m. Não são parâmetros personalizados para todo tipo de carga ou dimensões.
Fonte: https://apidocs.geoapify.com/docs/routing/

## Verificação
Testes simulados verificaram dois IDs no mesmo ponto, marcadores separados, seleção por deslize, entrega isolada, troca de mapa sem gravação na rota, alteração de veículo com progresso recente e disparo de recálculo. Regressões de câmera, otimização e construções 2D e sintaxe JavaScript verificadas.
Não houve teste visual em navegador, rota real ou GPS no aparelho neste ambiente. A comparação escolhe a melhor alternativa avaliada para o perfil, sem garantia de mínimo global.

## Instalação
Substituir os arquivos na hospedagem e recarregar, sem apagar dados locais. Endpoints atuais são compatíveis; não é necessário republicar o Worker.
