# Pacote É Mato — V35 — Combustível em 5 km

Data: 15/10/2026

## Objetivo
Corrigir a falha de carregamento dos postos observada no Android/WebView e limitar a pesquisa aos postos localizados em um raio de 5 km da posição atual do motorista.

## Alterações
- `js/combustivel/combustivel.js`
  - raio padrão e efetivo alterado para 5.000 metros;
  - ignora valor antigo de 8 km que possa ter ficado no estado da sessão;
  - procura primeiro postos nos POIs dos tiles vetoriais já carregados pelo MapLibre;
  - ajusta o mapa temporariamente ao raio de 5 km para carregar os tiles necessários;
  - filtra todos os candidatos por distância geodésica <= 5 km;
  - mantém fallbacks por Worker, Nominatim e Overpass;
  - mensagens ao usuário agora indicam explicitamente o raio de 5 km.

- `cloudflare/geocodificacao-worker.js`
  - `/fuel` passa a priorizar Geoapify Places, categoria `service.vehicle.fuel`, usando a chave já existente do Worker;
  - Overpass permanece como contingência.

- `index.html`
  - cache-buster e identificação atualizados para V35.

## Comportamento esperado
Ao tocar em Combustível, o app usa a localização atual, carrega a área de 5 km e mostra somente postos dentro desse raio. O funcionamento básico não depende mais exclusivamente de uma chamada direta ao Overpass.
