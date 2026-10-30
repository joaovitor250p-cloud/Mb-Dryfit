# Guia de atualização — MB REFERÊNCIAS 5.2.0

1. Faça backup do repositório atual.
2. Extraia o pacote e substitua os arquivos do repositório pelo conteúdo da pasta `Mb-Dryfit-main`.
3. Preserve os Secrets `VITE_FIREBASE_*` já cadastrados no GitHub.
4. Envie os arquivos para a branch `main`.
5. Abra **Actions** e acompanhe o workflow **Publicar MB REFERÊNCIAS**.
6. Confirme que as etapas de compilação e publicação do GitHub Pages terminaram com sucesso.

## Publicar as regras do Firestore

O workflow do GitHub publica somente o site. Ele não envia as regras do Firestore.

Como a edição e a exclusão das OCs passaram a ficar em **Cortes**, esta versão atualiza as permissões em `firestore.rules`.

1. Abra o Firebase Console do projeto usado pelo MB REFERÊNCIAS.
2. Entre em **Firestore Database → Regras**.
3. Salve uma cópia das regras atuais.
4. Substitua pelo conteúdo de `firestore.rules` deste pacote.
5. Clique em **Publicar**.

Não apague coleções, documentos, usuários ou dados do Firebase.

## Testes depois da atualização

- Abrir Catálogo, Amostras, Cortes, Ordem de Corte, Gastos, Informações MB e Oficinas.
- Em **Amostras**, confirmar que os cartões mostram somente foto e informações; a opção de adicionar nova amostra continua no cabeçalho.
- Em **Cortes**, confirmar que aparecem as ações de Pronto/Voltar, Editar/fotos e Excluir.
- Testar edição de dados, adicionar fotos, remover fotos e exclusão individual em uma OC de teste.
- Testar seleção e exclusão em lote apenas com registros de teste.
- Abrir fotos no notebook: confirmar que a imagem inteira cabe na área, que a rolagem comum não altera o zoom e que Ctrl + roda e os botões funcionam.
- Ampliar e arrastar a imagem para conferir o reposicionamento.
- No celular, testar pinça para ampliar, arraste e navegação entre fotos.

## Segurança

- A exclusão de uma OC é definitiva e remove o registro das áreas Amostras e Cortes.
- As fotos existentes são preservadas se a leitura da galeria falhar durante a edição de dados.
- Não remova nem altere os Secrets do GitHub ou as coleções do Firebase.
