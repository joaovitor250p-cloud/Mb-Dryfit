# LEIA PRIMEIRO — MB REFERENCIAS 4.11

Esta é a atualização completa de câmera no Catálogo, galeria isolada por amostra e correção das regras de nota fiscal.

## Antes de atualizar
- Faça backup do projeto e das regras atuais do Firestore.
- Não apague coleções nem documentos existentes.
- Não publique apenas os arquivos do site: publique também `firestore.rules`.

## Principais mudanças
1. Catálogo: Câmera e Galeria no cadastro/edição de modelos e na janela de foto principal.
2. Amostras: até 3 fotos; a principal fica no documento da OC e as fotos 2/3 ficam na subcoleção `gallery` da mesma OC.
3. Amostras: o app consulta as fotos 2/3 somente ao abrir aquela OC. Não consulta a antiga subcoleção `photos` nem carrega galeria de outras OCs.
4. Gastos: nota fiscal em `expenses/{id}/attachments/receipt`, consultada apenas ao abrir detalhes.
5. Painel Amostras: card compacto com quantidade em andamento.
6. Regras: permissões restritas a administrador/editor autorizado; consultas gerais da galeria bloqueadas.

## Publicação
1. Publique o arquivo completo `firestore.rules` em Firebase Console → Firestore Database → Regras.
2. Na pasta do `package.json`, rode `npm install` e `npm run build`.
3. Publique o projeto no GitHub Pages somente se o build terminar sem erros.
4. Teste câmera, galeria, salvar e reabrir uma amostra, salvar nota fiscal e editar um modelo.

Leia `README-PTBR.md` para o procedimento detalhado e a lista de testes.
