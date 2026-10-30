# MB REFERENCIAS — versão 4.15.2

Sistema web para catálogo de modelos, amostras, cortes, ordens de corte, gastos, informações internas e oficinas.

## Estrutura

- `src/`: telas e componentes da aplicação.
- `src/lib/`: conexão de dados, catálogo, fotos e memória de navegação.
- `src/assets/`: identidade visual MB Dri-Fit.
- `docs/`: guia de publicação e relatórios técnicos.
- `.github/workflows/`: publicação automática no GitHub Pages.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

## Validar a publicação

```bash
npm run build
```

O resultado é gerado na pasta `dist/`. O GitHub Actions publica automaticamente quando há push na branch `main`.

## Configuração de conexão

As credenciais do serviço de autenticação e dados permanecem configuradas nos Secrets já usados pelo fluxo de publicação. Não altere nem remova essas credenciais: login, permissões, fotos e registros dependem dessa conexão.

As regras de acesso existentes foram mantidas nesta versão. Não é necessário publicar novas regras para as melhorias de interface.

## Versão 4.15

- Galeria ampliada com navegação por toque, setas e teclado.
- Controles de zoom para notebook, roda do mouse e arraste da imagem ampliada.
- Fotos secundárias das amostras continuam em pilha atrás da principal.
- Navegação por gesto horizontal entre áreas autorizadas, com transição suave.
- Tela inicial com logo oficial e animação de carregamento.
- Textos da interface e documentação sem nomes de provedores técnicos.


## Correção 4.15.1

- Corrigida a abertura da galeria de fotos no formulário de Amostras.
- Ao clicar em qualquer miniatura, o visualizador recebe a lista completa de fotos e o índice selecionado, permitindo avançar e voltar entre as imagens.
- Corrigido o objeto enviado ao estado do visualizador para usar `images` e `index`, em vez da propriedade inválida `src`.
- Não altera regras, credenciais, coleções ou dados existentes.

## Correção 4.15.2 — gestos touch e touchpad

- Galeria: swipe horizontal com um dedo para trocar fotos.
- Tela touchscreen: pinça com dois dedos para ampliar/reduzir e arrastar para mover a foto ampliada.
- Touchpad de notebook: gesto de pinça (Ctrl/Cmd + roda) para zoom e deslize horizontal para trocar fotos.
- Navegação entre áreas: swipe horizontal na tela touchscreen e deslize horizontal no touchpad, com transição suave.
- Campos de texto, tabelas horizontais, modais e botões de navegação ficam protegidos contra troca acidental de área.
- Nenhuma coleção, documento ou regra de acesso foi alterada.
