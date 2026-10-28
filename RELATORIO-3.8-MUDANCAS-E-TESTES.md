# MB REFERENCIAS 3.8 — mudanças e testes

## Requisitos implementados
- Em **Amostras**: botões **Adicionar amostra**, **Importar OCs do CSV** (administrador, única execução concluída), **Selecionar cartões**. Cada cartão possui opção de **Adicionar foto / editar** e imagem clicável para zoom.
- Em **Cortes**: somente imagens e informações das OCs com duas abas **Em andamento** e **Prontos**, e o botão **Pronto** apenas para OCs em andamento. Sem edição/exclusão/cadastro/importação nos cartões de Cortes.
- Marcar **Pronto** muda o status do mesmo documento no Firestore. O filtro Amostras só exibe `in_progress`, então desaparece automaticamente, sem apagar a OC.
- O CSV fornecido já está embutido em `src/lib/initialCutsSeed.ts` e guardado no original em `exemplos/MOVIMENTACAO-DE-CORTE-ORIGINAL.csv`. O usuário pode abrir a prévia com **Usar planilha enviada (21 OCs)** e confirmar quando quiser.
- Prévia reconhece também a coluna `OFICINA` como costureiro e `STATUS = A FAZER`. Uma nova foto pode ser adicionada à amostra depois da importação.
- 9 oficinas vazias ficam explicitamente `NÃO INFORMADO` para cumprir regras atuais sem inventar nomes. Não há REF no CSV, portanto não foram atribuídas referências por semelhança. `27/out` é mantido no histórico de importação como texto porque o ano não foi fornecido.
- O catálogo principal com 194 modelos e 175 fotos iniciais não foi modificado. Nenhuma regra do Firebase foi alterada.

## Verificações realizadas
- Leitura da planilha com `csv.DictReader` e delimitador `;`: **21 linhas, 21 OCs distintas, 9 OFICINA vazias, 21 STATUS = A FAZER, sem REF**.
- Parsing AST do TypeScript em **13 arquivos TS/TSX**: sem erros sintáticos.
- Verificações estáticas da posição dos botões por aba e da associação de foto à amostra: aprovadas.
- Integridade ZIP: `ZipFile.testzip()` retorna `None`.
- `npm install`: falhou por `EAI_AGAIN` (registro npm inacessível); consequentemente `npm run build` e testes em Firebase real **não foram executados**. O GitHub Actions deverá validar a compilação antes do deploy.

## Cuidados
- Faça backups de modelos e OCs antes de publicar.
- A importação depende da conta administrador estar autenticada e de regras Firestore que já permitem criar `production_samples` e `audit_log`.
- A data original `27/out` não vira `createdAt` de 2026. `createdAt` registra o momento real da importação; o campo textual da planilha fica no histórico.
- Os registros existentes jamais são sobrescritos pelo importador.
