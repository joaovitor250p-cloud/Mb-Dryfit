# Relatório MB REFERENCIAS 5.0

## Escopo
Redesign da navegação e da apresentação visual sem migração de dados ou alteração de regras de acesso.

## Interface
- Desktop: sidebar persistente, navegação por área e cabeçalho fixo.
- Mobile: cabeçalho compacto, barra inferior fixa com quatro áreas prioritárias e menu Mais para áreas secundárias e administração.
- Cartões e painéis com densidade, tipografia, espaçamento, bordas e sombras revisados.
- Grades responsivas para catálogo e produção.

## Interação
- Swipe por touch events na área principal, com limite de deslocamento e proteção de controles interativos, tabelas e galeria.
- Swipe de touchpad por deltaX na área principal.
- Transição visual entre telas.
- Galeria com miniaturas selecionáveis, setas, contador, teclado, pinça touch, arraste para pan, wheel/trackpad e zoom por controles.
- Tratamento de perda/cancelamento de pointer para não interromper indevidamente uma pinça com dois dedos.

## Preservação
- Mantidos componentes de cadastro, edição, importação/exportação, produção, financeiro, notas fiscais, contas e histórico.
- Mantida integração atual de autenticação e dados.
- Nenhuma regra de acesso ou coleção precisa ser alterada por esta atualização de interface.
- As páginas continuam usando a memória de sessão já existente para pesquisa, filtros e rolagem.

## Validação
- Sintaxe TS/TSX será verificada com o compilador disponível.
- JSON e estrutura do ZIP serão validados.
- O build Vite/TypeScript integral depende da instalação das dependências npm; o ambiente de preparação não conseguiu concluir `npm install` por timeout de rede. Portanto, não declarar build completo aprovado até o GitHub Actions finalizar com sucesso.
