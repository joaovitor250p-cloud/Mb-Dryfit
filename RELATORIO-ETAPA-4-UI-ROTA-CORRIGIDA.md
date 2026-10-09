# Relatório — ETAPA 4 UI Rota + Navegação Simplificada

Base obrigatória utilizada: `Pacote-Em-Mato-ETAPA-4-UI-ROTA-CORRIGIDA.zip`.

Esta revisão foi feita de forma incremental. Não houve reconstrução do aplicativo, alteração do Cloudflare Worker ou refatoração do núcleo legado de login/PDF/bipagem.

## 1. Ajustes de navegação e simplicidade

### Início

A tela Início possuía dois atalhos para Roteirização e dois para Bipagem (`home-actions` + `quick-actions`), além de um atalho adicional para Histórico.

Agora a área de tarefas principais contém somente:

- **Planejar rota**
- **Abrir Bipagem**

O resumo da rota ativa continua no Início quando houver paradas reais. Uma rota vazia de planejamento não é apresentada como rota ativa no resumo.

### Histórico

O único acesso de navegação para Histórico fica na barra lateral. O módulo, os registros, a persistência e o botão interno de Histórico anterior foram preservados.

### Configurações

A opção Configurações foi removida somente do menu de três pontos da Roteirização. A tela Configurações e o botão correspondente na barra lateral continuam intactos.

### Menu de três pontos

O menu passou a conter apenas ações secundárias:

- Usar rota da Bipagem
- Inverter ordem (quando aplicável)
- Exportar PDF (quando houver paradas)

Importar planilha, Adicionar endereço, Localizar/Otimizar e Iniciar rota não dependem mais desse menu.

## 2. Fluxo de Planejar rota

Ao entrar em Roteirização sem paradas, a tela mostra diretamente:

- **Importar planilha XLSX**
- **Adicionar endereço manualmente**
- mapa
- painel inferior de paradas

Quando já existe rota, ela é carregada e preservada. O painel expandido oferece ações visíveis de **Importar XLSX** e **Adicionar endereço**. Selecionar uma nova planilha pede confirmação antes de abrir o seletor; a rota anterior só é substituída depois que a nova planilha é lida com sucesso.

O botão principal da Roteirização muda conforme o estado real:

- sem paradas → Importar planilha XLSX;
- paradas sem coordenadas → Localizar/Tentar localizar;
- coordenadas prontas e serviço de rota configurado → Otimizar rota;
- coordenadas prontas e serviço não configurado → Otimizar rota desabilitado, com motivo;
- rota calculada → Iniciar rota.

Não há otimização simulada.

## 3. Correções mantidas de XLSX, mapa e localização

Esta revisão incorpora as correções sobre a mesma base UI:

- leitura de Latitude/Longitude quando existirem na planilha;
- coordenadas ausentes/inválidas permanecem `null`, nunca `0,0`;
- paradas importadas sem coordenadas continuam na lista;
- tentativa de geocodificação pode ser repetida sem reimportar o XLSX;
- localização atual automática é separada do ponto inicial da rota;
- localização recente da sessão evita pedidos repetidos ao GPS;
- permissão negada é respeitada.

### Causa do erro `Cannot read properties of undefined (reading 'lng')`

O marcador do ponto inicial era anexado ao MapLibre com `.addTo(mapa)` antes de receber `.setLngLat(...)`. O MapLibre podia tentar atualizar um marcador cuja coordenada interna ainda era indefinida.

A ordem agora é:

```text
new Marker(...)
→ setLngLat([lon, lat])
→ addTo(mapa)
```

O erro acontece no mapa/renderização, antes de qualquer necessidade de otimização ou chamada ao Worker.

## 4. Cloudflare

`cloudflare/geocodificacao-worker.js` e `cloudflare/wrangler.toml` permaneceram byte a byte iguais à base recebida.

Nenhum Worker foi publicado, reconfigurado ou alterado.

Sem serviço externo configurado, o aplicativo preserva os endereços e informa a limitação. Ele não inventa coordenadas ou uma rota otimizada.

## 5. Arquivos criados

- `js/mapa/localizacao-atual.js`

## 6. Arquivos modificados

- `README.md`
- `RELATORIO-ETAPA-4-UI-ROTA-CORRIGIDA.md`
- `index.html`
- `css/mapa.css`
- `css/roteirizacao.css`
- `js/state.js`
- `js/importacao/xlsx.js`
- `js/mapa/mapa.js`
- `js/roteirizacao/roteirizacao.js`
- `js/ui/app-shell.js`

Nenhum arquivo foi removido.

## 7. Arquivos críticos preservados byte a byte

SHA-256 comparado com o ZIP-base:

- `js/app.js`
- `js/bipagem/rota-ativa-bridge.js`
- `js/suporte.js`
- `js/historico/historico-rotas.js`
- `manifest.json`
- `politica-privacidade.html`
- `cloudflare/geocodificacao-worker.js`
- `cloudflare/wrangler.toml`

## 8. Testes realmente executados

### Navegação/UI em Chromium automatizado

Viewport mobile 412 × 915 e desktop 1365 × 768.

Resultados:

- Início possui exatamente 2 cartões de tarefa: Planejar rota e Abrir Bipagem;
- não existe atalho de Histórico na tela Início;
- existe exatamente 1 acesso de navegação a Histórico, na barra lateral;
- Configurações não aparece no menu de três pontos;
- Importar planilha e Adicionar parada não aparecem no menu de três pontos;
- Planejar rota abre `moduloRoteirizacao`;
- Importar planilha XLSX aparece sem abrir menu;
- Adicionar endereço manualmente aparece sem abrir menu;
- o menu de três pontos contém somente ações secundárias;
- mapa mobile ocupa 412 × 915 atrás do painel inferior;
- no desktop o mapa mediu 957 px de largura e a lista 370 px.

### Importação XLSX real

Foi criado e enviado ao `input[type=file]` um XLSX real com:

- linha de título antes do cabeçalho;
- Endereço;
- Número;
- Cidade;
- UF;
- Código de pacote;
- Observação.

Resultado:

- 2 linhas → 2 paradas;
- números preservados;
- códigos BR preservados;
- cards renderizados na lista;
- nenhum erro de página no teste.

### Adicionar endereço

Foi aberto o formulário pela ação visível, preenchido `Rua Manual, 55 - São Paulo` e salvo sem serviço de geocodificação configurado.

Resultado:

- parada adicionada à rota;
- rota passou de 2 para 3 paradas;
- endereço ficou preservado mesmo sem coordenada.

### Rota ativa

Depois de importar e adicionar a parada, foi feita navegação Início → Planejar rota novamente.

Resultado:

- mesmo ID de rota;
- mesmas 3 paradas;
- rota ativa não foi apagada ao entrar no planejamento.

### Localização atual

Teste isolado do módulo real:

- permissão concedida → posição armazenada;
- duas atualizações automáticas consecutivas → apenas 1 chamada ao GPS por causa do cache recente da sessão;
- permissão negada → nenhuma chamada ao GPS e status `negada`.

### Regressão do erro `.lng`

Foi usado um `Marker` de teste que lança exatamente `Cannot read properties of undefined (reading 'lng')` se `addTo()` for chamado antes de `setLngLat()`.

Resultado com o código corrigido:

- marcador do ponto inicial criado;
- nenhuma exceção `.lng`;
- nenhum `pageerror`.

### Estrutura/sintaxe

- todos os arquivos em `js/` passaram em `node --check`;
- Worker passou na checagem de sintaxe como ES Module sem ser modificado;
- 321 IDs HTML, sem duplicatas;
- nenhuma referência local ausente além do `tutorial-pacote-e-mato.mp4`, que já estava ausente na base recebida.

## 9. Limitações reais

Não foram testados contra produção nesta sessão:

- Firebase real da conta;
- câmera/scanner em Android físico;
- GPS em dispositivo físico;
- tiles externos no site publicado;
- geocodificação/otimização reais, pois o Worker não foi configurado por solicitação do usuário.

Essas partes não são declaradas como aprovadas em produção apenas porque o código existe.
