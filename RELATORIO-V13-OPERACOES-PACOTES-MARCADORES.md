# Pacote É Mato — V13 — Adicionar/Remover pacotes por bipagem + marcadores

Data da entrega: 10/10/2026
Base utilizada: V12 — Marcadores Definitivos.

## 1. O que foi implementado

### Adicionar à rota

Foi adicionada a ação **Adicionar à rota** ao menu de ações da Roteirização.

Fluxo implementado:

1. O usuário escolhe uma planilha XLSX/CSV.
2. A planilha é lida pela importação existente, com associação manual de colunas somente quando o reconhecimento automático não for suficiente.
3. Os dados ficam em uma área temporária e **não alteram a Rota Ativa**.
4. O aplicativo abre a Bipagem existente em modo de seleção.
5. Somente códigos realmente bipados são selecionados.
6. Código repetido, código já existente na rota ou código não encontrado não é adicionado.
7. A tela de conferência mostra totais, códigos, endereços, quantidade selecionada por endereço e alertas.
8. Antes de confirmar é possível remover itens da seleção ou cancelar toda a operação.
9. Na confirmação, apenas os pacotes selecionados entram na rota.
10. Se não houver rota ativa, é criada uma nova rota com os pacotes confirmados.

O agrupamento usa a chave física compartilhada da operação, priorizando logradouro + número e mantendo a lógica de agrupamento do projeto. Se já existir uma parada pendente compatível, o novo pacote é acrescentado nela. Uma parada já finalizada não é reaberta: o novo pacote cria uma nova parada pendente no mesmo ponto físico para preservar o histórico anterior.

Depois da confirmação existem três formas de organização:

- **Manter a ordem atual e acrescentar as novas paradas**: a sequência antiga é preservada e as novas paradas entram no final como grupo de adição.
- **Otimizar somente as novas paradas**: usa o endpoint real `/optimize` somente para o grupo novo, preserva a ordem antiga e depois exige recálculo real do trajeto completo.
- **Otimizar a rota inteira**: usa o endpoint real `/optimize` em todas as paradas e depois recalcula o trajeto real.

Se uma otimização solicitada falhar, a rota anterior não é substituída.

### Remover da rota

Foi adicionada a ação **Remover da rota**.

Fluxo implementado:

1. O usuário importa a planilha de referência.
2. A planilha fica temporária e não altera a rota.
3. O usuário bipa apenas os pacotes que realmente sairão da rota.
4. O código precisa existir tanto na planilha da operação quanto na Rota Ativa.
5. Código inexistente na rota, repetido ou protegido por histórico/status é bloqueado.
6. A tela de conferência mostra os códigos, endereços e quantos pacotes permanecerão na parada física.
7. Somente após confirmação os códigos selecionados são removidos.
8. A remoção é por pacote, nunca indiscriminadamente por endereço.
9. Se ainda houver pacotes na parada, a parada permanece.
10. Se nenhum pacote permanecer e a parada não for histórica/finalizada, a parada é removida.

Pacotes de paradas entregues/concluídas/não entregues, ou já registrados como bipados/tratados, não são removidos silenciosamente.

## 2. Segurança da alteração da rota

As operações são feitas em uma cópia da Rota Ativa. A rota persistida só é trocada depois da confirmação e de todas as etapas obrigatórias terem sido concluídas.

- Cancelar descarta o estado temporário.
- Falha de otimização solicitada preserva a rota anterior.
- Falha de persistência não encerra a operação como concluída.
- A parada selecionada é preservada se continuar existindo.
- Se a parada selecionada deixar de existir, é escolhida uma parada previsível da sequência restante.
- `proximaParadaId` é preservado quando válido e corrigido somente quando necessário.
- A rota em andamento exibe aviso de que o trajeto poderá precisar de recálculo.
- Quando há alteração sem recálculo real disponível, `precisaRecalculo=true` impede iniciar/retomar a navegação como se a geometria antiga ainda fosse confiável.

O histórico resumido das operações confirmadas fica em `historicoOperacoesPacotes` na própria rota, limitado pela normalização persistente da Rota Store.

## 3. Scanner e entrada manual

O modo de operação reutiliza o caminho de leitura da Bipagem existente. `processarCodigo` delega para o módulo de operações somente enquanto uma operação temporária estiver ativa.

Isso mantém o scanner/câmera e a entrada manual existentes sem fazer a Bipagem normal modificar a Rota Ativa durante a seleção temporária.

Os sons e a fala existentes são reutilizados quando disponíveis.

## 4. Marcadores do mapa

A arquitetura nativa do MapLibre da V12 foi preservada. Não foram reintroduzidos marcadores HTML soltos, `position: fixed` ou deslocamentos permanentes de coordenadas.

O marcador individual continua sendo uma cápsula compacta gerada por `js/mapa/marcadores.js`:

- fundo pendente `#0f172a`;
- borda branca fina;
- número sequencial em destaque;
- multiplicador menor somente quando a quantidade real for maior que 1;
- `1x` não é mostrado;
- tamanhos limitados para um, dois e três dígitos;
- destaque da parada selecionada sem escala exagerada.

Planejamento e Navegação usam a mesma fonte operacional para o total de pacotes físicos e para a sequência atual.

O agrupamento de zoom distante foi reduzido para um indicador discreto (raio visual de 10,5 px, cluster radius 26 e cluster máximo até zoom 12), evitando as antigas bolhas grandes. Ao ampliar, os marcadores individuais reaparecem.

As coordenadas das paradas não são alteradas para evitar colisão visual.

## 5. Quantidade de pacotes no cartão

O cartão da navegação e os cartões da Roteirização passaram a usar a mesma função operacional de contagem física usada pelos marcadores quando disponível.

Exemplos:

- marcador `8` -> cartão `1 pacote`;
- marcador `8 2x` -> cartão `2 pacotes`;
- marcador `8 3x` -> cartão `3 pacotes`.

A contagem é recalculada após adição e remoção e também ao restaurar a rota normalizada.

## 6. Arquivos alterados em relação à V12

### Novos

- `js/bipagem/operacoes-pacotes.js` — fluxo temporário de adicionar/remover, bipagem, conferência, mutação segura, otimização e persistência.
- `css/operacoes-pacotes.css` — banner do modo de bipagem e tela de conferência responsiva.
- `RELATORIO-V13-OPERACOES-PACOTES-MARCADORES.md` — este relatório.

### Alterados

- `index.html` — ações Adicionar/Remover, novo CSS/JS e versionamento de cache V13.
- `js/app.js` — interceptação da leitura do scanner somente quando uma operação temporária está ativa.
- `js/roteirizacao/roteirizacao.js` — importação reutilizável com mapeamento, contagem física, sequência atual, aviso/controle de recálculo e integração das operações.
- `js/mapa/mapa.js` — sequência atual, contagem operacional e cluster discreto.
- `js/navegacao/navegacao.js` — contagem real no cartão, bloqueio de rota que precisa recálculo, marcadores/cluster consistentes.
- `js/core/rota-store.js` — persistência de `precisaRecalculo` e `historicoOperacoesPacotes`.
- `js/ui/app-shell.js` — impede entrada na Navegação enquanto a rota estiver marcada para recálculo.
- `README.md` — documentação resumida da V13.

`js/mapa/marcadores.js` da V12 foi preservado porque já contém a cápsula MapLibre nativa aprovada como base visual; a correção V13 foi aplicada à fonte dos dados, ciclo de renderização e clustering que o alimentam.

## 7. Testes executados neste ambiente

Os testes abaixo foram realmente executados. Eles são testes de código/estrutura e não equivalem a validação visual em um celular real.

### Sintaxe JavaScript

- Todos os arquivos `.js` em `js/` foram verificados com `node --check`.
- Resultado: **PASS**, sem erro de sintaxe.

### Mutação real da rota — 30 paradas

Foi executado o módulo real `PacoteEMatoOperacoesPacotes._teste.executarMutacaoTeste` sobre uma rota de 30 paradas.

Cenário de adição:

- três pacotes selecionados;
- um pacote entrou em uma parada física já existente;
- dois pacotes formaram uma nova parada física;
- um quarto pacote da planilha, não bipado, não entrou na rota;
- IDs da ordem permaneceram únicos;
- parada selecionada anterior foi preservada.

Cenário de remoção:

- remoção de um pacote de uma parada com três deixou a parada com dois;
- remoção do único pacote de uma parada pendente removeu apenas aquela parada;
- parada selecionada foi preservada quando continuou válida;
- tentativa de remover pacote de parada entregue foi bloqueada.

Resultado: **PASS**.

### Importação CSV — 30 pacotes

Foi executado o importador existente com arquivo simulado de 30 linhas contendo código, endereço e coordenadas válidas.

Resultado: **PASS** — 30 pacotes/paradas processados no teste.

### Marcadores

Foi executado o módulo real de marcadores com canvas/mapa simulados:

- marcador simples `1`;
- marcador múltiplo `38 3x`;
- parada de três dígitos `123 3x`;
- multiplicador somente para `>1`;
- largura múltipla maior que simples, mas limitada ao máximo definido;
- variantes normal e selecionada geradas.

Resultado: **PASS**.

### Persistência/normalização

Foi executada a normalização da Rota Store verificando:

- quantidade derivada do array real de pacotes;
- metadados do grupo de adição preservados;
- histórico de operações preservado;
- flag `precisaRecalculo` preservada.

Resultado: **PASS**.

### Estrutura HTML e marcador

- IDs duplicados em `index.html`: **0**.
- Botões `routingAddPackagesBtn` e `routingRemovePackagesBtn`: presentes.
- Auditoria estática não encontrou `new maplibregl.Marker`, `.marker-parada-pill` HTML nem marcador `position: fixed` no sistema de mapa.
- Planejamento e Navegação usam cluster discreto com `clusterRadius: 26`, `clusterMaxZoom: 12` e círculo de 10,5 px.

Resultado: **PASS**.

## 8. Testes que ainda precisam de validação manual

Não foram declarados como aprovados porque este ambiente não executa a experiência completa de um navegador/celular com câmera, GPS e serviços externos reais.

Ainda devem ser conferidos no aparelho/publicação:

1. Câmera e leitura de código de barras real no modo Adicionar.
2. Câmera e leitura real no modo Remover.
3. Entrada manual real no mesmo fluxo.
4. XLSX reais com cabeçalhos diferentes e modal de associação de colunas.
5. Endpoint real `/optimize` nas três opções de organização.
6. Endpoint real `/route` após adição/remoção.
7. Persistência Firebase/IndexedDB no ambiente publicado e recuperação após fechar/reabrir o PWA.
8. MapLibre em celular: zoom, pan, clusters, seleção e 30+ paradas reais.
9. Painel inferior recolhido/expandido sem marcador atravessar a interface.
10. Retorno do Waze e Google Maps após uma operação confirmada.
11. Aparência em desktop e diferentes densidades de tela.
12. Rotas reais com endereços idênticos/coordenadas idênticas, confirmando o comportamento do cluster/lista de seleção.

## 9. Arquivos importantes preservados

Não foram removidos os módulos existentes de login/Firebase, PDF, importação XLSX, scanner/câmera, bipagem normal, histórico, geocodificação, otimização, Waze/Google Maps, configurações ou permissões.

A implementação foi integrada à arquitetura existente e não cria um aplicativo separado.
