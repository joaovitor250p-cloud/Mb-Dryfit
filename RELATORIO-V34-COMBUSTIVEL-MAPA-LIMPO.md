# Relatório V34 — Combustível corrigido e mapa limpo

Data: 15/10/2026

## Correções

1. A busca de postos agora usa preferencialmente `POST /fuel` no Cloudflare Worker do Pacote É Mato.
2. O Worker consulta servidores Overpass no backend, evitando o bloqueio CORS/preflight observado no Android/WebView.
3. Há fallback no cliente usando GET em múltiplos endpoints Overpass.
4. Mensagens de erro não exibem mais `Failed to fetch` cru ao usuário.
5. O mapa esconde camadas de POIs não operacionais (hospitais, ônibus/transporte, comércio, alimentação, turismo etc.) e mantém ruas e nomes viários.
6. A camada de combustível continua separada das paradas para que os postos não sejam deslocados.

## Publicação do Worker

A rota `/fuel` foi adicionada em `cloudflare/geocodificacao-worker.js`. É recomendado republicar esse Worker com a mesma configuração usada atualmente. Sem a republicação, a V34 ainda tenta a consulta direta GET como contingência, mas o Worker é o caminho mais estável.
