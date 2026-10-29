# Relatório de alterações da versão 3.9

**Base:** `MB-REFERENCIAS-3.8-AMOSTRAS-CORTES-CSV.zip`.

Arquivos alterados:
- `src/App.tsx`: escolha, otimização, prévia e gravação de foto ao cadastrar ou editar um modelo, sem sobrescrever a imagem já salva se não foi escolhida nova foto.
- `src/ModelPhotos.tsx`: remoção dos contadores Com foto/Sem foto e filtro por tipo de peça.
- `src/SampleWorkflow.tsx`: filtro por tipo de peça apenas em Amostras. Cortes mantém os dois estados.
- `src/styles.css`: estilos responsivos para formulário com foto e filtro compacto.
- `src/lib/modelTypes.ts` (novo): classificador puro baseado no começo do nome, com regras separando `CAM` de `CAMISETA`.
- `package.json`: versão 3.9.0.
- `LEIA-PRIMEIRO-3.9.md`: instruções de implantação e testes.

Preservados: catálogo de 194 modelos, associação inicial de 175 imagens no JSON, importação das 21 OCs, seleção múltipla, zoom, backups, login, workflow e regras Firestore. Nenhuma imagem existente foi substituída.

**Testes concluídos:** analisador sintático TS 14/14; teste unitário de prefixos; teste de classificação de 194 modelos; tipagem estrita do classificador; integridade do ZIP.

**Limitação:** não foi possível concluir `npm install` devido ao acesso ao registro npm (30 segundos sem resposta), impedindo executar `npm run build` local. Nenhum teste com Firebase de produção foi realizado; use GitHub Actions antes de considerar pronto.
