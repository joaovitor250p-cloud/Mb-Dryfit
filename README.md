# Pacote É Mato — ETAPA 4 UI Rota Corrigida

Versão cumulativa baseada diretamente em `Pacote-Em-Mato-ETAPA-4-UI-ROTA-CORRIGIDA.zip`.

## Fluxo principal

```text
Início
├── Planejar rota
└── Abrir Bipagem

Barra lateral
├── Início
├── Roteirização
├── Bipagem
├── Histórico de rotas
└── Configurações
```

O Histórico não possui atalho duplicado na tela Início. Configurações não aparece no menu de três pontos da Roteirização.

## Roteirização

Ao entrar sem paradas, o usuário vê diretamente:

- **Importar planilha XLSX**
- **Adicionar endereço manualmente**
- mapa
- painel inferior de paradas

Com uma rota existente, a rota é preservada. O painel de paradas mantém ações visíveis para importar outra planilha ou adicionar endereço. Uma nova importação pede confirmação antes de abrir o seletor e só substitui a rota após leitura válida do novo arquivo.

O botão principal acompanha o estado real da rota: importar, localizar, otimizar ou iniciar. Se o serviço externo não estiver configurado, a otimização não é simulada.

## Menu de três pontos

Reservado a ações secundárias:

- Usar rota da Bipagem
- Inverter ordem quando aplicável
- Exportar PDF quando houver paradas

## XLSX, mapa e localização

- XLSX/XLS/CSV continuam suportados.
- Latitude/Longitude válidas presentes na planilha são aproveitadas.
- Coordenadas ausentes/inválidas ficam `null`, nunca `0,0`.
- Paradas sem coordenadas continuam na lista.
- O erro MapLibre `.lng` foi corrigido configurando `setLngLat()` antes de `addTo()` no marcador do ponto inicial.
- A localização atual pode ser obtida automaticamente e permanece separada do ponto inicial configurado da rota.

## Cloudflare

Nenhum Worker foi alterado ou publicado nesta revisão.

`cloudflare/geocodificacao-worker.js` e `cloudflare/wrangler.toml` permanecem exatamente como estavam na base recebida.

## Preservação do núcleo

Permaneceram byte a byte iguais à base:

- `js/app.js`
- `js/bipagem/rota-ativa-bridge.js`
- `js/suporte.js`
- `js/historico/historico-rotas.js`
- `manifest.json`
- `politica-privacidade.html`
- arquivos Cloudflare

Consulte `RELATORIO-ETAPA-4-UI-ROTA-CORRIGIDA.md` para diagnóstico e testes executados.
