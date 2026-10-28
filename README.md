# MB REFERENCIAS 3.8 — Amostras e Cortes

Aplicação React + TypeScript + Firebase, publicada com GitHub Actions em `https://joaovitor250p-cloud.github.io/Mb-Dryfit/`.

## Alteração desta versão
- **Amostras**: cadastrar OCs, importar uma vez o CSV inicial, selecionar/excluir cartões, editar modelo/REF/costureiro e adicionar foto à OC depois.
- **Cortes**: apenas listas *Em andamento* / *Prontos*, fotos com zoom e o botão **Pronto** para finalizar cada OC. Nenhum botão de cadastro, importação, edição, exclusão ou reabertura no painel Cortes.
- Ao concluir o corte, a mesma OC muda de `in_progress` para `done`, deixa de aparecer em Amostras e fica na lista Prontos de Cortes.
- As fotos iniciais do Catálogo e as regras existentes do Firebase permanecem.

## CSV incluído
O arquivo enviado pelo usuário está em `exemplos/MOVIMENTACAO-DE-CORTE-ORIGINAL.csv`, e já está embutido no aplicativo para importação com um clique: **Amostras → Importar OCs do CSV → Usar planilha enviada (21 OCs)**. A prévia mostra todos os dados. A gravação só ocorre após confirmação explícita.

São 21 OCs, todas `A FAZER`, com 9 oficinas não preenchidas e nenhuma coluna REF. Os responsáveis ausentes são indicados como `NÃO INFORMADO` para corrigir depois, e a REF permanece vazia, evitando associações equivocadas. A coluna `27/out` não inclui ano; é preservada como texto no histórico da importação.

## Publicação
1. Baixe backups JSON de modelos e OCs do site atual.
2. Descompacte este ZIP; envie o conteúdo à raiz do repositório `joaovitor250p-cloud/Mb-Dryfit` (inclusive `.github`).
3. Confira **Build** e **Deploy** na aba GitHub Actions.
4. Reabra o site, confira o catálogo existente e, na aba Amostras, importe as 21 OCs.
5. Acrescente fotos pelos botões **Adicionar foto / editar** nos cartões da aba Amostras, depois finalize em Cortes com **Pronto**.

Nenhuma foto será inventada e nenhuma OC existente será sobrescrita. O projeto não requer mudanças nas regras Firestore para o novo formato CSV.

## Verificações
Consulte `RELATORIO-3.8-MUDANCAS-E-TESTES.md`. A sintaxe de 13 arquivos TS/TSX e a integridade do ZIP foram conferidas; a compilação total e o acesso real ao Firebase não foram testados aqui por indisponibilidade do registro npm.
