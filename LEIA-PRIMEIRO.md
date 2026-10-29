# Patch de filtros — MB REFERÊNCIAS 4.8

Copie os arquivos mantendo as pastas para o projeto atual e substitua os arquivos de mesmo nome:
- `src/lib/modelTypes.ts`
- `src/ModelPhotos.tsx`
- `src/SampleWorkflow.tsx`
- `src/CutOrders.tsx`
- `package.json` (apenas atualiza a versão para 4.8.0; pode manter o seu caso já tenha outras alterações próprias)

A correção resolve os prefixos BERM/CAM e permite procurar por “bermuda” mesmo quando o nome salvo é “BERM”. Em Ordem de Corte foi adicionado o filtro por tipo.

Depois de substituir os arquivos, rode `npm install` e `npm run build`. Este ambiente não conseguiu terminar a instalação das dependências, então a compilação completa deve ser validada antes de publicar.
