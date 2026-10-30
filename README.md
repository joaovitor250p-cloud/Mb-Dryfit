# MB REFERENCIAS — versão 4.15

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
