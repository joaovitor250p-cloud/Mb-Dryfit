# MB REFERÊNCIAS — Atualização: memória das abas e exclusão de OC

Data: 04/11/2026

## O que mudou

1. **Voltar à mesma tela sem perder a edição:** o `src/App.tsx` agora mantém montadas as páginas já visitadas no menu, ocultando apenas as que não estão ativas. Assim, uma edição de OC, um cadastro de oficina, uma pesquisa ou um formulário de ficha permanecem como estavam ao navegar para outra aba e voltar, **enquanto o site continuar aberto e sem recarregar**. O mecanismo fica no menu central e será aplicado às páginas futuras adicionadas por ele.
2. **Posição de rolagem preservada:** o `App.tsx` registra o scroll ao deixar cada aba. O `src/lib/pageMemory.ts` foi ajustado para apenas a aba ativa registrar sua posição, evitando que abas ocultas sobrescrevam o histórico de leitura das demais.
3. **Exclusão de OC:** em `src/CutOrders.tsx`, botões **Excluir** na lista e no editor para administradores. Abre um diálogo de confirmação com o número da OC e o modelo. **Cancelar** não altera nada; **Sim, excluir OC ...** apaga somente o documento escolhido na coleção `cut_orders`. A ficha de produção relacionada continua existindo.
4. **Segurança:** a regra existente em `firestore.rules` já continha `allow delete: if isAdmin()` na coleção `cut_orders`, portanto nenhuma permissão foi afrouxada. Usuários com permissão apenas de editar OCs **não** veem o botão Excluir.
5. **Impressão de fichas com abas guardadas:** `src/ProductionSheets.tsx` só abre a impressão quando a página da ficha estiver ativa, prevenindo impressão fora de hora após troca de aba.
6. **Estilos:** `src/styles.css` recebeu regras para esconder abas inativas e apresentar a confirmação de exclusão com destaque e botões distintos.
7. **Testes:** acrescentados dois testes preventivos em `tests/preflight.test.cjs` sobre navegação e exclusão.

## Firebase: criação automática de Ordem de Corte

O usuário confirmou que uma OC distribuída apareceu na área Ordem de Corte do sistema real. Isso é evidência de sucesso nesse teste. A análise do projeto verificou que a distribuição usa um `writeBatch` que atualiza `production_sheets` e cria `cut_orders` com ID correspondente ao da ficha. As regras do Firestore já autorizam esse fluxo para quem tem `sheet_distribution` e validam seus campos. **Nenhuma alteração foi feita nesse fluxo que já funcionou.**

A exclusão de uma OC gerada automaticamente **não volta a ficha ao estado de pendente** e **não recria a OC automaticamente**: isso é proposital para não apagar/recriar registros sem consentimento.

## Testes e limites

- `npm run test:preflight`: **8 testes passaram**.
- Todos os arquivos `.ts` e `.tsx` analisados sintaticamente com o compilador TypeScript: **sem erros sintáticos**.
- `npm run build`: **não foi possível terminar neste ambiente**: o projeto não tem `node_modules` e a instalação offline falhou devido à ausência de pacotes em cache (`ENOTCACHED`). Como resultado, `tsc` indica que não encontra `react`, `firebase` e suas tipagens; isso não comprova um defeito específico da atualização.
- Testes de interface no navegador e uma exclusão real no Firebase: **não executados**. Por segurança, não apagamos registros reais do usuário.
- A memória em execução **não equivale a salvar um rascunho no banco**: se recarregar a página, sair da conta ou fechar o navegador, formulários não salvos podem ser perdidos. Use Salvar / Rascunho quando necessário.
- Áreas visitadas continuam montadas e ouvindo atualizações do Firebase durante a sessão; é a contrapartida técnica escolhida para preservar edição e filtros.

## Como publicar

1. Faça backup da versão atual. Extraia o ZIP e copie o projeto para a pasta local ligada ao GitHub, preservando `.git` e configurações privadas `.env`.
2. Execute `git add .`, `git commit -m "Manter abas abertas e excluir OC com confirmacao"`, `git push`.
3. Em **GitHub > Actions**, abra o fluxo **Publicar MB REFERENCIAS no GitHub Pages**; confira as etapas **Instalar dependências**, **Testar regras estruturais**, **Compilar aplicação Vite** e **Publicar site**. Só depois use a versão nova do site.
4. **Para estas duas mudanças não é necessário publicar novas regras no Firebase**, desde que as regras já publicadas sejam as da versão que criou a OC e mantenham a permissão `cut_orders/delete` para administradores. Se aparecer `permission-denied`, compare com a cópia das regras implantadas no projeto Firebase correto.

## Teste manual recomendado (em dados de TESTE)

1. Abra Ordem de Corte > edite uma OC de teste, digite uma alteração **sem salvar**, troque para Oficinas e volte: o editor e o valor digitado devem continuar presentes.
2. Abra Preços de REF > preencha REF e valor, visite Catálogo, volte: os campos devem continuar preenchidos.
3. Em Ordem de Corte, encontre uma **OC de teste** > clique Excluir > verifique que o número correto está na confirmação > clique **Cancelar**. A OC deve continuar existindo.
4. Repita com a OC de teste > confirme. A OC deve sumir da lista e da coleção `cut_orders`; a ficha de produção, se houver, deve continuar.
5. Entre com conta que tem apenas edição de OCs: o botão de exclusão não deve aparecer.
6. Distribua uma **nova ficha de teste** e confirme que a OC continua sendo criada automaticamente como antes.

**Atenção:** não faça o primeiro teste de exclusão usando uma OC real de produção. Uma exclusão confirmada é definitiva.
