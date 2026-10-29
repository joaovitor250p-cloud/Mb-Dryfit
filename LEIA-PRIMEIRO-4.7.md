# MB REFERÊNCIAS 4.7 — Gastos, Informações MB, Oficinas e responsividade

## Alterações desta versão

- Reorganizada a página **Gastos**: valores em destaque, data mais legível, busca por valor/data/observação e fichas mais limpas.
- Reorganizada a página **Informações MB**: nome principal e valor aparecem uma vez no cabeçalho; o titular do PIX só aparece abaixo quando for diferente do nome principal, evitando repetição desnecessária.
- Removidos os botões de importação de planilha das páginas **Gastos** e **Informações MB**. Os dados já gravados no Firestore continuam sendo consultados normalmente.
- Adicionada a área **Oficinas**, com cadastro, edição e exclusão de oficina, telefone/WhatsApp, vários tipos de peça e preço por unidade.
- Adicionada a permissão **Oficinas** na administração de contas.
- Reorganizado o catálogo no celular: os cartões de modelo passam a ocupar uma coluna em telas estreitas, evitando que os nomes e valores quebrem palavra por palavra.
- Liberado o zoom nativo do navegador (pinça/trackpad, Ctrl + roda e atalhos de zoom). O visualizador de fotos continua com seu zoom próprio.
- Aplicada identidade visual branca e laranja, com ajustes de contraste no modo escuro.
- Usada a logo MB nos cabeçalhos de Gastos, Informações MB e Oficinas, além dos locais onde ela já aparecia.

## Publicação

1. Faça uma cópia de segurança do repositório antes de substituir arquivos.
2. Copie os arquivos deste pacote para o projeto existente, preservando os arquivos `.env`/segredos e as variáveis do GitHub Actions.
3. Publique as regras atualizadas de `firestore.rules` no projeto Firebase correto. As regras acrescentam a coleção `workshops` e a permissão correspondente, sem abrir leitura/gravação pública.
4. Confirme no GitHub Actions que `npm run build` concluiu com sucesso.
5. Entre com uma conta administradora e abra **Oficinas**. Para permitir acesso a editores, abra **Usuários** e habilite a permissão Oficinas para cada conta desejada.

## Dados e segurança

- Não foram incluídas planilhas de gastos, chaves PIX, telefones ou dados de funcionários dentro do pacote.
- As páginas Gastos e Informações MB continuam lendo as coleções existentes `expenses` e `mb_info`; esta versão não apaga nem substitui esses registros.
- As oficinas são salvas na nova coleção `workshops` e ficam protegidas pelas regras de área/usuário.
- O tema escuro continua sendo escolhido pelo botão de lua/sol no topo e guardado no navegador.

## Validação

- Os 19 arquivos TypeScript/TSX foram analisados por transpilation estática; não foram encontrados erros de sintaxe.
- O `npm install` não concluiu neste ambiente por timeout; portanto o build completo e a publicação real ainda precisam ser confirmados no GitHub Actions.
- A conexão com o Firebase real não foi alterada por esta preparação e não foi executada nenhuma gravação na base real.
