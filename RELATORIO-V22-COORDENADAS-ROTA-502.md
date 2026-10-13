# Pacote É Mato — V22 — Coordenadas + rota grande + erro 502

## Diagnóstico

Foram encontrados dois problemas independentes no fluxo de rotas grandes:

1. **Coordenadas XLSX eram aceitas apenas por serem numericamente válidas.**
   Se a planilha trouxesse latitude/longitude válidas, mas associadas ao ponto errado, a parada era marcada como `ok` e a geocodificação não conferia se a rua/número correspondiam àquela coordenada.

2. **A geometria de toda a rota era enviada em uma única requisição ao endpoint `/route`.**
   Em uma rota com 101 paradas, isso significa ponto inicial + cerca de 101 waypoints em uma única chamada. Falhas do provedor eram mascaradas pelo Worker como HTTP 502.

Além disso, a ordem otimizada era aplicada na rota em memória antes da geometria terminar. Portanto, uma falha no segundo estágio podia deixar a interface com ordem nova, mas distância/geometria ausentes.

## Correções

### 1. Auditoria endereço x coordenada XLSX

Arquivo: `js/mapa/geocodificacao.js`

Foi adicionada `validarCoordenadasImportadas()`.

- Só trabalha com coordenadas já existentes e provenientes da planilha.
- Geocodifica o endereço usando o serviço já existente.
- Exige a mesma validação rígida já utilizada pelo projeto: número do imóvel compatível, rua compatível e confiança mínima.
- Compara a coordenada XLSX com a coordenada validada do endereço.
- Se a divergência for maior que 120 m e a geocodificação for de alta confiança, substitui a coordenada usada pela rota.
- A coordenada original da planilha é preservada em `coordenadaPlanilhaOriginal`.
- O resultado da auditoria é persistido para não repetir a conferência a cada otimização.
- Se o endereço for editado depois, a validação volta a ser necessária.
- Se a geocodificação for ambígua ou falhar, nenhuma coordenada é inventada.

Arquivo: `js/roteirizacao/roteirizacao.js`

Antes de otimizar uma rota com coordenadas XLSX ainda não conferidas, o aplicativo agora executa a auditoria acima e salva eventuais correções antes de enviar os pontos ao otimizador.

### 2. Geometria de rotas grandes dividida em blocos

Arquivo: `js/roteirizacao/servico-rota.js`

A função `calcularRotaPelasRuas()` não envia mais todos os waypoints em uma única chamada.

- Limite padrão: 24 pontos por bloco.
- O último ponto de um bloco também é o primeiro do bloco seguinte, garantindo continuidade.
- Cada trecho é calculado pelas ruas pelo mesmo serviço real.
- As geometrias, pernas, distância, tempo e waypoints são unidos novamente na ordem correta.
- Não existe fallback em linha reta.
- Requisições transitórias 5xx recebem uma segunda tentativa curta.
- O erro agora informa qual trecho falhou quando o provedor não consegue calcular um bloco.

Para 101 paradas + ponto inicial, o teste sintético resultou em 5 chamadas: `24, 24, 24, 24, 10` pontos.

### 3. Otimização transacional

Arquivo: `js/roteirizacao/roteirizacao.js`

A nova sequência e a nova geometria são montadas em uma cópia da rota. `rotaAtual` só é substituída depois que todos os cálculos terminam com sucesso.

Se o serviço falhar, a rota anterior não fica parcialmente alterada.

### 4. Mensagens de erro melhores

Arquivo: `js/roteirizacao/servico-rota.js`

Foram adicionadas mensagens específicas para `optimizer_error` e `route_error`, substituindo em vários casos a mensagem genérica `Falha no serviço de rota (502)`.

### 5. Cache bust

`index.html` passou de `v21` para `v22` nos CSS/JS para impedir o celular de reutilizar os scripts anteriores.

## Testes executados

- `node --check` em todos os JavaScripts do projeto: **OK**.
- `node --check` no Worker Cloudflare incluído no projeto: **OK**.
- IDs duplicados no `index.html`: **0**.
- Simulação de geometria com **102 pontos** (ponto inicial + 101 pontos):
  - chamadas geradas: `24, 24, 24, 24, 10`;
  - nenhum bloco excedeu 24 pontos;
  - 101 pernas foram recompostas na ordem correta;
  - soma de distância preservada no teste.
- Simulação de coordenada XLSX errada:
  - coordenada importada colocada artificialmente a 1.508 m do endereço validado;
  - auditoria detectou divergência;
  - coordenada corrigida;
  - coordenada original preservada.
- ZIP: verificar após empacotamento.

## Validação ainda necessária no aparelho

- Reimportar a planilha real de 101 paradas e confirmar se a parada da Avenida Vila Ema é corrigida pela validação de endereço.
- Otimizar a rota real de 101 paradas e confirmar o comportamento do serviço publicado.
- Comparar distância/horário final com a referência usada pelo motorista.

Sem a planilha real usada no print, não é possível afirmar que a parada 50 específica foi corrigida em dados reais; a correção implementada elimina a causa estrutural que permitia uma coordenada XLSX incompatível com o endereço passar como válida.
