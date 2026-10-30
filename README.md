# MB REFERENCIAS — versão 4.14

Sistema web de catálogo de modelos, amostras, cortes, ordens de corte, gastos, informações internas e oficinas.

## Estrutura enxuta

- `src/`: telas e componentes da aplicação.
- `src/lib/`: Firebase, catálogo, fotos e memória de navegação.
- `src/assets/`: identidade visual otimizada.
- `functions/`: funções administrativas do Firebase.
- `exemplos/`: planilhas de referência para importação.
- `docs/`: guia de publicação e relatórios técnicos atuais.
- `.github/workflows/`: publicação automática no GitHub Pages.

Os componentes antigos duplicados na raiz foram removidos. A versão usada pelo aplicativo fica somente em `src/`.

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

## Configuração do Firebase

Configure no GitHub Secrets as variáveis `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`.

As regras atuais ficam em `firestore.rules`. A cópia original recebida foi preservada em `docs/firestore.rules.backup-original.txt` para consulta; publique somente o arquivo `firestore.rules` da raiz quando uma atualização de regras for necessária.

## Versão 4.14

- Corrige o tipo `Production` para incluir o marcador Firestore `updatedAt`, usado pela pilha de fotos das Amostras.
- Carrega as áreas do sistema sob demanda.
- Carrega a biblioteca de planilhas apenas quando uma importação é iniciada.
- Converte a logo para WebP, mantendo transparência e reduzindo o arquivo em aproximadamente 76%.
- Remove cópias antigas de componentes e documentos de versões anteriores da raiz.

Consulte `docs/GUIA-PUBLICACAO.md` e `docs/RELATORIO-4.14.md`.
