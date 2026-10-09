# Pacote É Mato — Roteirização e Navegação Própria

Esta versão é uma evolução incremental de `Pacote-Em-Mato-ETAPA-4-UI-ROTA-CORRIGIDA.zip`. O núcleo legado de login/Firebase, PDF, agrupamento físico, scanner e Bipagem não foi reescrito.

## Principais mudanças

- Marcadores de parada migrados de elementos HTML `Marker` para uma fonte GeoJSON e camadas nativas do MapLibre.
- Marcadores compactos, numerados e com estados pendente, parcial, concluída e não entregue.
- O ponto inicial e a localização do motorista também são camadas geográficas, evitando o erro de marcador sem coordenada.
- Controles do mapa organizados em grupo vertical: Minha localização, Enquadrar rota, Aproximar e Afastar.
- `Importar XLSX` e `Otimizar rota` permanecem visíveis na Roteirização; Importar XLSX também permanece no menu de ações.
- A linha da rota aceita `LineString` e `MultiLineString` reais retornadas pelo serviço rodoviário.
- Métricas da rota só são exibidas como calculadas quando há geometria e cálculo rodoviário válidos.
- Navegação interna com GPS, linha planejada, progresso percorrido, próxima manobra, próxima parada, voz pt-BR, controle de acompanhamento e detecção de desvio.
- Entregue e Não entregue persistem status, data/hora e motivo; o fluxo avança para a próxima parada pendente.
- Ao tratar todas as paradas, a rota fica aguardando confirmação de encerramento; não é finalizada automaticamente.

## Arquitetura do serviço de rotas

O frontend usa a base segura já prevista pelo projeto. Quando `pemato_worker_base_url` está configurado, os endpoints derivados são:

```text
/geocode  -> geocodificação
/optimize -> Geoapify Route Planner
/route    -> Geoapify Routing API, geometria e instruções
/health   -> disponibilidade do Worker/provedor
```

O Worker existente em `cloudflare/geocodificacao-worker.js` não foi modificado nem publicado nesta revisão. A chave `GEOAPIFY_API_KEY` permanece prevista somente no ambiente do Worker.

Sem um Worker configurado, o sistema não inventa coordenadas, ordem otimizada, distância, linha rodoviária ou instruções.

## Fluxo de roteirização

```text
XLSX / parada manual / rota da Bipagem
                ↓
            Paradas
                ↓
       Geocodificação segura
                ↓
        Coordenadas válidas
                ↓
      /optimize (ordem real)
                ↓
       /route (ruas reais)
                ↓
   geometria + distância + tempo
                ↓
           Rota Ativa
                ↓
      Navegação / Bipagem
```

## Navegação interna

A navegação própria é uma PWA/web app e usa `navigator.geolocation.watchPosition()` apenas enquanto a navegação está ativa. Ela:

- acompanha a posição do motorista;
- não move os marcadores das paradas;
- mantém linha planejada e progresso em camadas separadas;
- usa os índices das instruções retornadas pela Routing API para orientar o progresso;
- usa `speechSynthesis` em português quando disponível;
- evita repetir a mesma instrução por limiar de distância;
- identifica desvio significativo e tenta recalcular quando o endpoint `/route` estiver disponível;
- preserva Waze e Google Maps como alternativas.

Limitação: navegadores móveis podem suspender GPS, JavaScript e áudio quando a página vai para segundo plano. Esta versão não promete comportamento equivalente a um navegador GPS nativo em background.

## Preservação do núcleo

Comparados por SHA-256 com a base recebida, permaneceram byte a byte iguais:

- `js/app.js`
- `js/bipagem/rota-ativa-bridge.js`
- `js/suporte.js`
- `cloudflare/geocodificacao-worker.js`
- `cloudflare/wrangler.toml`
- `manifest.json`
- `politica-privacidade.html`

Consulte `RELATORIO-ETAPA-4-ROTEIRIZACAO-NAVEGACAO-PROPRIA.md` para auditoria, testes e limitações.
