# Pacote É Mato — V33 — Combustível perto de mim

Data: 15/10/2026

## Implementado
- Nova opção **Combustível** no menu lateral e atalho no mapa.
- Busca de postos próximos à localização atual em um raio padrão de 8 km usando dados públicos OpenStreetMap/Overpass.
- Postos ficam em camada própria e coordenadas fixas, independentes das paradas e da otimização da rota.
- Marcadores identificam bandeiras conhecidas por abreviação (BR, IP, SH, ALE etc.) e usam marcador genérico quando a bandeira não é informada.
- Distância em linha reta exibida junto ao posto.
- Preços são exibidos quando a fonte pública disponibiliza tags de preço; caso contrário o app informa que o preço não foi fornecido.
- Card do posto com nome, bandeira, endereço, distância, preços disponíveis e ações para **Waze** e **Google Maps**.
- A camada pode ser ligada/desligada sem alterar a rota, a ordem das paradas ou o status das entregas.
- Consulta possui fallback entre dois endpoints públicos Overpass e limite de 80 postos no mapa.

## Observação sobre preços
A base pública usada para descobrir os postos não garante preços atualizados. A interface da V33 já está preparada para exibir preços quando recebidos. Para cobertura de preços em tempo real será necessária uma API/base específica de preços de combustíveis.
