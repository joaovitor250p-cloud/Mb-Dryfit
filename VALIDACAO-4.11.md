# Validação — MB REFERENCIAS 4.11

## Verificações estáticas feitas
- Conferência dos pontos de entrada: `index.html` usa `src/main.tsx`, que carrega `src/App.tsx`.
- Câmera e galeria adicionadas tanto ao formulário de modelo quanto à janela de foto do catálogo.
- Fotos adicionais de amostras isoladas em documentos `gallery/photo_2` e `gallery/photo_3` por OC.
- Remoção de leituras da antiga subcoleção `photos` e de leitura automática do campo legado `extraImages`.
- Regras de Firestore incluídas para a nova galeria e para a nota fiscal.
- Exclusão de amostras remove os IDs conhecidos das galerias nova e antiga.
- Arquivos TypeScript/TSX submetidos à verificação de sintaxe/transpilação.

## Verificações que dependem do ambiente do projeto
- `npm install` precisa completar com acesso ao registro de pacotes para instalar React, Firebase, Vite e dependências.
- `npm run build` precisa ser executado após a instalação.
- As regras precisam ser publicadas no projeto Firebase real.
- Câmera e galeria precisam ser testadas no celular real, pois a disponibilidade da câmera depende do navegador e das permissões do aparelho.
- O salvamento precisa ser confirmado com contas reais de administrador e editor com permissões correspondentes.

Não considere o projeto publicado até o build e os testes no Firebase terminarem sem erros.

## Resultado desta sessão

- A verificação sintática por TypeScript transpilation passou em 19/19 arquivos `.ts`/`.tsx` da pasta `src`.
- O CSS passou na análise do PostCSS.
- Os arquivos JSON de configuração passaram na leitura/validação.
- Os delimitadores do arquivo `firestore.rules` foram conferidos.
- **Build completo não confirmado:** `npm install` excedeu o tempo limite e o ambiente não conseguiu resolver `registry.npmjs.org` (falha de DNS). Por isso, não foi possível instalar as dependências e executar o build real nesta sessão.
