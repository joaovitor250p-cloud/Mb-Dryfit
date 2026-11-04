# MB REFERÊNCIAS — Relatório de auditoria e correções

**Data:** 04/11/2026  
**Base examinada:** `MB_REFERENCIAS_CORRECAO_FICHA_OC_OFICINAS.zip`  
**Entrega:** código-fonte revisado, regras Firestore, função administrativa e testes automatizados.

## Resultado

A revisão de código foi realizada e foram corrigidos problemas de impressão, permissões, interpretação de valores, validação e consulta de OCs por oficina. **Não é possível certificar o funcionamento em produção sem publicar e testar no Firebase do projeto.**

### Problemas encontrados e mudanças feitas

| Área | Problema identificado | Alteração aplicada |
|---|---|---|
| Firebase / administração | `functions/index.js` autorizava apenas `catalog`, `samples`, `cuts`, embora o app tenha 9 áreas. | Lista de permissões da função atualizada para as 9 áreas, inclusive `orders`, `workshops`, `sheets` e `sheet_distribution`. **É necessário publicar a função no Firebase.** |
| Firebase / publicação | O projeto publicava o frontend no GitHub Pages; isso não publica regras Firestore nem Cloud Functions. | `firebase.json` agora informa a origem da pasta `functions`; instruções específicas abaixo. |
| Ficha / impressão | Várias regras `@media print` contraditórias e o conteúdo impresso dentro da árvore do site podiam causar página adicional e corte. | CSS de impressão refeito; ficha isolada usando React portal diretamente no `body`; modelo A4 e bordas/alinhamento revisados. |
| Ficha / layout | Aviamentos ocupava espaço excessivo; parte de Oficina e tabela ficavam mal distribuídas. | Ajustadas as proporções, os espaçamentos e a coluna da oficina. Apenas linhas com conteúdo são impressas, mais a linha de totais. |
| Ficha / impressão após distribuir | A ficha saía da lista de pendentes logo após a distribuição, sem ação imediata para imprimir. | Botão **Imprimir ficha distribuída com costureiro** permanece visível após confirmação. |
| Ficha / informação obrigatória | A REF podia ser enviada em branco. | Validação de modelo, OC e REF ao enviar, também refletida nas regras Firestore. |
| Ficha / quantidades | Entradas negativas ou decimais podiam ser ignoradas ou produzir total incorreto. | Quantidades são verificadas como inteiros não negativos antes de enviar e distribuir. |
| Preços | A entrada `4.50` era convertida incorretamente para `450`. | Conversor aceita `4,50`, `4.50`, `R$ 1.234,56` e rejeita entradas inválidas / preço zero. |
| Oficinas / OCs | O CSV anterior era gerado a partir das fichas, sem dados financeiros posteriores. | Na página **Oficinas**, usuários com acesso a `orders` podem ver e baixar OCs verdadeiras da coleção `cut_orders`, com status e pagamento. |
| Oficinas / Mauro | Importar os nove costureiros ignorava um Mauro que já existisse no cadastro e não acrescentava suas exceções. | Importação agora completa tipos e exceções ausentes, sem substituir preços já editados. |
| Comunicação de erro | Falhas na distribuição tinham mensagem pouco específica. | Exibição do código retornado pelo Firebase quando disponível, especialmente para `permission-denied`. |
| GitHub Pages / testes | Sem testes locais automatizados na rotina de publicação. | Adicionado `npm run test:preflight` e execução antes de `npm run build` no GitHub Actions. |

### Arquivos relevantes alterados

- `src/ProductionSheets.tsx`
- `src/WorkshopsPage.tsx`
- `src/App.tsx`
- `src/lib/referencePrices.ts`
- `src/styles.css`
- `firestore.rules`
- `functions/index.js`
- `firebase.json`
- `package.json`
- `.github/workflows/deploy.yml`
- `tests/preflight.test.cjs` (novo)

## Testes executados

- **6/6 testes de pré-verificação passaram**: parsing de preços, valores confirmados, duplicações na lista de preço, permissões, integração estrutural do código e sintaxe de arquivos TS/TSX.
- **Verificação sintática de `functions/index.js`: aprovada.**
- **Teste de impressão no Chromium com dados simulados:** fichas com **2, 8 e 14 linhas** foram geradas em **1 página A4 cada**. A versão de 14 linhas foi inspecionada visualmente para verificar bordas e alinhamento.
- A lista inicial contém **100 combinações tipo + referência**; isso não é necessariamente o total de referências distintas.

## O que não foi possível testar aqui

1. `npm install` e `npm run build` completos: dependências não disponíveis localmente e ambiente sem acesso ao registro npm. O **GitHub Actions fará a instalação e o build** após o envio dos arquivos.
2. Autenticação real, permissões por usuário, banco Firestore e gravação automática da Ordem de Corte: exigem o projeto Firebase de produção ou emulador configurado e dados de teste.
3. Impressora física, opções de margens/cabeçalho do navegador e fichas com texto muito extenso.
4. O aplicativo limita a impressão de uma ficha a **14 linhas preenchidas**, para reduzir o risco de uma segunda página. Fichas extensas precisam ser divididas ou ter seu layout revisto.

**Portanto, os testes locais não equivalem à aprovação final em produção.**

## Como publicar corretamente

### A. Atualizar o site no GitHub Pages

1. Faça backup da versão atual do projeto.
2. Extraia o ZIP revisado. Copie os arquivos atualizados para o repositório, preservando `.git` e as configurações privadas do projeto.
3. Envie as alterações para o GitHub (`git add .`, `git commit -m "Correcoes MB Referencias"`, `git push`).
4. Abra **GitHub > Actions > Publicar MB REFERENCIAS no GitHub Pages** e verifique se **test:preflight** e **build** ficaram verdes. Se houver erro, não considere o site validado.

### B. Publicar as regras e a função do Firebase (etapa separada, obrigatória)

Na pasta do projeto, com Firebase CLI, permissões de administrador e o **projeto Firebase correto** selecionado:

```bash
firebase login
firebase use SEU_ID_DO_PROJETO_FIREBASE
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```

Se `firebase use` solicitar inicialização, confirme o ID do projeto manualmente e **não escolha outro Firebase**. Atualizar apenas o GitHub Pages **não atualiza as regras** nem a função `manageAccount`. A publicação de Cloud Functions pode exigir o plano Blaze e permissões específicas do Firebase. **Faça backup das regras atuais antes de substituí-las.**

### C. Conferir cadastros e acessos

1. Em **Preços de REF**, clique **Importar lista inicial** e confira os preços. A importação preserva valores já cadastrados.
2. Em **Oficinas**, clique **Importar 9 costureiros** e confira principalmente o Mauro. A importação completa cadastros existentes sem substituir preços especiais já alterados.
3. No administrador de contas, atribua a Nildo `sheets` e à pessoa que distribui `sheet_distribution` (papel **editor**). A pessoa que edita a OC deve ter `orders` como editor.
4. Na página Oficinas, as OCs reais ficam visíveis para quem também possui acesso a `orders`.

### D. Teste obrigatório antes de usar com pedidos reais

1. Entre com o usuário criador e envie **uma ficha de teste** com REF 10088, tipo Camiseta e quantidades conhecidas.
2. Entre com o usuário distribuidor. Selecione **Mauro**: o preço sugerido deve ser **R$ 4,00**. Selecione **Jony**: deve ser **R$ 3,50**.
3. Distribua para Mauro e verifique a mensagem de sucesso. Em **Ordem de Corte**, confirme o novo registro com OC, REF, quantidade, preço e data de envio.
4. Edite a nova Ordem de Corte com o usuário de `orders` e teste status e pagamento.
5. Imprima a ficha e confirme **uma página A4**, apenas linhas preenchidas e nome do costureiro. No navegador, desative **Cabeçalhos e rodapés**.
6. No cadastro de Mauro, abra **Ordens de Corte** e teste o CSV.
7. Teste uma REF não cadastrada: deve mostrar o aviso e exigir preço antes de distribuir.

Se a criação da OC falhar, anote **o código exibido pelo Firebase** e confira que a mesma conta possui `sheet_distribution` e que **regras + funções** foram publicadas no projeto usado pelo site.
