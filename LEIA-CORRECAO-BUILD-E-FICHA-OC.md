# MB REFERÊNCIAS — correção da compilação e Ficha na Ordem de Corte

## O que mudou

1. **Correção TS2339** em `src/CutOrders.tsx`: o estado inicial da memória da página agora declara `showFriday: false`. Isso corrige o erro do GitHub Actions exibido na imagem do usuário, onde `initialPageState.showFriday` não existia no tipo inferido.
2. **Botão Ficha** em cada linha da planilha de **Ordem de Corte**, ao lado do botão Editar, na tela de edição da OC e nas linhas do Pagamento de Sexta. O botão procura a ficha exata pelo ID do documento da Ordem de Corte, que é o mesmo ID usado pela distribuição automática.
3. **Impressão compartilhada** em `src/SheetPrint.tsx`, reutilizada tanto pela área Fichas de Produção quanto pela Ordem de Corte, com nome do costureiro atribuído, campos originais e totais. Abre a impressão do navegador; escolha **Salvar como PDF** para baixar.
4. **OCs manuais/históricas**: se a OC não foi criada pela distribuição, não há ficha correspondente; o sistema informa isso. Se o número da OC foi alterado posteriormente, a ficha original continua acessível com seu número original.
5. **CSS de impressão**: modais de edição abertos são ocultados durante a impressão para não sobrepor a ficha.
6. **Firestore**: `get` de uma ficha *já distribuída* agora é permitido a usuários que podem visualizar Ordens de Corte. **Listar** todas as fichas ou ler rascunhos continua exigindo permissão de Fichas/Distribuição.

## Como instalar

- Faça backup do projeto e substitua os arquivos de código pelo conteúdo deste ZIP **sem apagar `.git` nem as configurações privadas `.env`**.
- Envie a atualização à branch `main`. O workflow do GitHub Actions executará `npm install`, `npm run test:preflight` e `npm run build`.
- **Publique também `firestore.rules` no Firebase** para que usuários com permissão de Ordens de Corte (sem permissão de Fichas) consigam abrir a ficha associada. Publicar no GitHub Pages não publica regras do Firebase.
- Entre em **Ordem de Corte**, encontre uma OC gerada pela distribuição e clique em **Ficha** → **Salvar como PDF**. Na janela de impressão, desative "Cabeçalhos e rodapés".
- Teste uma OC antiga importada: deverá aparecer o aviso de que não possui ficha vinculada.

## Testes

- `npm run test:preflight`: **17/17 aprovados**, incluindo o novo teste estrutural da ficha e da correção de tipo.
- `npm run build`: **não concluído aqui**, porque as dependências React/Firebase/Lucide não estão instaladas e não há acesso ao registro de pacotes neste ambiente. A etapa de instalação no GitHub Actions é a responsável pelo build completo.
- Teste de Firestore com credenciais reais: **não executado**. A regra precisa ser publicada e verificada no site.

## Arquivos relevantes

- `src/CutOrders.tsx`
- `src/ProductionSheets.tsx`
- `src/SheetPrint.tsx` (novo)
- `src/styles.css`
- `firestore.rules`
- `tests/preflight.test.cjs`
