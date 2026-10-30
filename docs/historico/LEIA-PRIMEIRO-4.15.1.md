# MB REFERENCIAS 4.15.1 — correção da galeria

Esta versão corrige o erro de compilação apontado pelo GitHub Actions em `src/SampleWorkflow.tsx` na abertura da galeria de fotos das Amostras.

## Correção

O visualizador recebe agora o formato esperado pelo estado: `images`, `index`, `name`, `reference` e `oc`. Ao clicar em uma miniatura, todas as fotos que estão no formulário são enviadas à galeria e a imagem clicada abre como a foto ativa.

## Publicação

1. Extraia o ZIP.
2. Copie o conteúdo da pasta `Mb-Dryfit-main` para a raiz do repositório, substituindo os arquivos correspondentes.
3. Faça commit e push na branch `main`.
4. Acompanhe GitHub Actions.

Não publique novas regras do banco de dados. Não apague coleções, documentos, fotos, credenciais ou Secrets.

## Verificação local

```bash
npm install
npm run build
```

O build completo não foi confirmado neste ambiente porque `npm install` excedeu o tempo limite de rede. A correção foi conferida diretamente no ponto indicado pelo TypeScript.
