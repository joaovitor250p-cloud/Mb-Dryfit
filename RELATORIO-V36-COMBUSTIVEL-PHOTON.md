# Pacote É Mato — V36 — Combustível 5 km com Photon

## Correção
A V35 ainda podia falhar em Android/WebView quando Worker, Nominatim e Overpass não respondiam ao `fetch` do navegador.

A V36 adiciona o Photon/Komoot como fonte principal externa. A consulta usa dados OpenStreetMap, filtro `amenity=fuel`, latitude/longitude atuais e limite de resultados. Depois, o próprio app calcula a distância geodésica e descarta tudo acima de 5.000 m.

## Ordem de consulta
1. POIs dos tiles já carregados no mapa.
2. Photon/Komoot (`amenity=fuel`).
3. Worker `/fuel`.
4. Nominatim.
5. Overpass.

Os marcadores de postos continuam em source/layer própria e não alteram as paradas da rota.
