# MB REFERÊNCIAS — versão 5.3.1

Sistema web para catálogo de modelos, amostras, cortes, ordens de corte, gastos, informações internas e oficinas.

## O que mudou nesta versão

### Amostras
- Cartões mostram somente a foto e as informações da OC.
- A criação de novas amostras e a importação inicial continuam nesta área.
- A galeria de fotos continua disponível para consulta.

### Cortes
- Edição dos dados e das fotos da OC.
- Exclusão individual e exclusão em lote.
- Ações de andamento e Pronto continuam disponíveis.
- As fotos adicionais são carregadas na galeria.

### Visualizador de fotos
- Fotos inteiras ajustadas à área disponível, sem corte vertical no notebook.
- A rolagem normal do mouse não altera o zoom.
- No notebook, Ctrl + roda ou os botões controlam o zoom.
- Depois de ampliar, arraste a imagem para reposicionar.
- No celular, pinça para ampliar e arraste para mover.

### Proteção das imagens
- O formulário de edição abre com os dados já disponíveis, sem esperar a leitura da galeria.
- Se as fotos adicionais não puderem ser lidas, ainda é possível salvar os dados.
- Nesse caso, a foto principal e as fotos adicionais existentes são preservadas; os controles de adicionar/remover fotos ficam bloqueados até a galeria carregar.

## Estrutura

- `src/`: telas e componentes da aplicação.
- `src/lib/`: conexão de dados, catálogo, fotos e memória de navegação.
- `src/assets/`: identidade visual MB Dri-Fit.
- `docs/`: guias e relatórios técnicos.
- `exemplos/`: arquivos de exemplo para importação.
- `functions/`: funções do Firebase.
- `.github/workflows/`: publicação automática no GitHub Pages.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

## Validar a aplicação

```bash
npm run build
```

O resultado é gerado na pasta `dist/`. O GitHub Actions publica automaticamente quando há push na branch `main`.

## Configuração do Firebase

As credenciais da aplicação continuam sendo fornecidas pelos Secrets já usados no fluxo de publicação. Não altere nem remova esses Secrets.

**Atenção: esta versão atualiza `firestore.rules`.** Como as ações de editar e excluir foram movidas para Cortes, as regras agora permitem que um editor com permissão de Cortes atualize e exclua as OCs e suas fotos.

O workflow atual do GitHub publica somente o site no GitHub Pages; ele **não publica automaticamente as regras do Firestore**. Depois de atualizar o repositório, publique também o conteúdo de `firestore.rules` no Firebase Console:

1. Abra o projeto correto no Firebase Console.
2. Entre em **Firestore Database → Regras**.
3. Faça backup das regras atuais.
4. Substitua pelo conteúdo do arquivo `firestore.rules` desta versão.
5. Clique em **Publicar**.

Não apague coleções, documentos, usuários, dados ou Secrets do Firebase.

## Segurança e dados

- Esta atualização não migra nem apaga dados.
- A exclusão de uma OC continua sendo definitiva e exige confirmação.
- A galeria mantém o limite de três fotos por amostra.
- O `.gitignore` exclui apenas dependências, saídas de build, arquivos locais e caches de compilação.


## Versão 5.3.0

Corrige o salvamento de novos modelos: a criação no catálogo é independente da gravação do histórico, com mensagens claras de erro e prevenção de duplicidade. Consulte `docs/RELATORIO-5.3.0-CORRECAO-SALVAR-MODELO.md`.


## Versão 5.3.1

Identifica automaticamente pedidos de Ordem de Corte atrasados: quando o prazo final registrado já passou e a produção ainda não está marcada como ENTREGUE, o sistema mostra o selo **Atrasado**, destaca a quantidade no resumo e permite filtrar somente os atrasados. A data original do prazo continua visível e não é apagada, recalculada ou substituída pela identificação de atraso. O selo é calculado na tela e não altera os dados gravados no Firestore. Nenhuma publicação foi realizada nesta entrega.
