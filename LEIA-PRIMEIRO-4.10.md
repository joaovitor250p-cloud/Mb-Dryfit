# MB REFERENCIAS 4.10 — correção de fotos e contagem de amostras

## O que foi corrigido

### Amostras
- A tela não consulta mais `production_samples/{id}/photos` ao abrir uma OC.
- A tela não usa foto do Catálogo de Modelos como substituta da foto da amostra.
- Só aparecem as imagens gravadas no próprio documento da OC: `imageData` (principal) e `extraImages` (até duas adicionais).
- Câmera e Galeria continuam disponíveis; a Galeria permite selecionar várias imagens.
- A primeira imagem é a principal. Ao remover a primeira no formulário, a próxima passa a ser a principal.
- Foi incluído um cartão compacto com a quantidade de amostras em andamento.
- A gravação da OC não depende da gravação do histórico. Se o histórico falhar, a amostra continua salva.

### Gastos
- Abrir o formulário de edição não tenta carregar a nota fiscal.
- Uma nota fiscal existente é preservada quando a pessoa altera apenas data, valor, nome ou observações.
- A nota fiscal é consultada apenas quando o usuário abre os detalhes do gasto.
- Se o upload da nota fiscal falhar depois que o gasto foi salvo, o formulário permanece aberto para tentar novamente sem duplicar o lançamento.

### Firestore
- `firestore.rules` aceita o campo opcional `extraImages` em `production_samples`.
- As regras de produção aceitam registros antigos sem metadados opcionais, mantendo os campos centrais validados.
- As regras de nota fiscal permitem gravar o anexo apenas para administrador/editor com permissão de Gastos.

## Atenção aos dados antigos

Fotos adicionais que existam somente na antiga subcoleção `production_samples/{id}/photos` não são carregadas nem migradas. O app passa a trabalhar apenas com as fotos que estão no próprio documento da OC. A foto principal antiga (`imageData`) é preservada. Ao excluir uma OC, o app limpa os dois IDs conhecidos da galeria antiga sem baixar as imagens.

## Publicação

1. Faça backup do repositório e das regras atuais do Firestore.
2. Publique as regras do arquivo `firestore.rules` no Firebase Console, preservando regras personalizadas do projeto.
3. Substitua os arquivos do projeto pelos arquivos deste pacote.
4. Execute `npm install` e `npm run build`.
5. Faça commit/push para a branch de publicação e teste em uma aba anônima.

Para editar fotos de amostras, a conta precisa ter perfil administrador ou editor com acesso à área **Amostras**. Para anexar nota fiscal, precisa de perfil administrador ou editor com acesso à área **Gastos**.
