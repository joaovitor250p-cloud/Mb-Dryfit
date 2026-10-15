# Pacote É Mato — V37 — Combustível 5 km / correção CORS

## Causa
O Worker da V36 validava `Origin` antes de executar `/fuel`. Em PWA/WebView o navegador pode enviar origem diferente ou `null`, causando bloqueio e `Failed to fetch` mesmo com internet.

## Correção
- `/fuel` foi separado das rotas privadas e agora aceita `GET`/`OPTIONS` com CORS público.
- GET simples não envia cabeçalhos customizados e evita preflight.
- O raio é limitado a 5.000 m também no servidor.
- O cliente usa primeiro `${workerBaseUrl}/fuel?lat=...&lon=...&radius=5000`.
- Photon, Nominatim e Overpass deixaram de ser chamados diretamente pelo celular.
- `/geocode`, `/optimize` e `/route` continuam com a segurança anterior.

## Implantação obrigatória
A correção só passa a existir no domínio `workers.dev` depois de publicar `cloudflare/geocodificacao-worker.js` desta V37 no Worker usado pelo app.
