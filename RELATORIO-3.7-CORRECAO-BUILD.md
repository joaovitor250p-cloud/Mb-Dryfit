# Relatório de correção — MB REFERENCIAS 3.7

## Arquivos alterados

- `src/BackupExport.tsx`: retorno `get()` passa a ser `Promise<ExportDocument[]>` com `Record<string,unknown>`, corrigindo o acesso tipado aos campos dos documentos do Firestore. Status antigo `store` aparece como `PRONTO` na planilha.
- `src/SampleWorkflow.tsx`: remove botões, indicadores e categoria `Chegou na loja`, mantém `Pronto` e `Em andamento`, preserva visualização das OCs com status legado `store` em `Prontos`. Evita modificação automática dessas OCs.
- `package.json`: versão 3.7.0.
- `README.md`, `LEIA-PRIMEIRO-3.7.md` e este relatório.

## Verificações

- Parser oficial TypeScript 5.8.3 em todos os 11 arquivos TS/TSX: 0 erros de sintaxe.
- Teste isolado do uso de `Record<string,unknown>` e `Map` no exportador via `tsc --strict --noEmit`: sucesso.
- Inspeção estática: nenhuma chamada para `mark(p,'store')`, nenhuma aba com `Chegou na loja`, filtro `Prontos` inclui `done` e `store`; Amostras só inclui `in_progress`.
- `npm install --no-audit --no-fund --prefer-offline --fetch-retries=0`: falhou com EAI_AGAIN no registry.npmjs.org, sem gerar node_modules.
- `npm run build`: não executado (dependências indisponíveis).
- Regras de segurança, banco de dados e repositório público: não modificados.
