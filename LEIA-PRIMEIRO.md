MB REFERÊNCIAS — CORREÇÃO DE FILTROS (PATCH)

IMPORTANTE: este ZIP contém arquivos de código, não deve ser enviado ao GitHub como um único arquivo .zip.

COMO APLICAR:
1. Extraia o ZIP no computador.
2. Abra o repositório GitHub joaovitor250p-cloud/Mb-Dryfit.
3. Substitua os arquivos existentes exatamente nestes caminhos, sem criar uma pasta extra:
   - src/lib/modelTypes.ts
   - src/ModelPhotos.tsx
   - src/SampleWorkflow.tsx
   - src/CutOrders.tsx
4. Faça commit na branch main.
5. Abra Actions e aguarde o workflow “Publicar MB REFERENCIAS” terminar com sucesso.
6. No site, force uma atualização com Ctrl+F5 no computador ou abra em uma aba anônima no celular.

O erro anterior ocorreu porque o código que estava no caminho src/ do repositório não continha todas as alterações anunciadas: a pesquisa do catálogo não chamava a função de busca por abreviação e o componente Ordem de Corte não tinha o filtro por tipo de peça.

Este patch corrige:
- filtro por prefixo BERM/BERMUDA, CAM/CAMISA/CAMISETA, REGATA, CONJUNTO, CALÇA e JAQUETA;
- busca por termos completos e abreviados, incluindo consultas como “bermuda”, “bermuda nike” e “camisa”;
- filtro por tipo em Catálogo, Amostras, Cortes e Ordem de Corte;
- pesquisa e filtro combinados, sem alterar dados do Firebase.

Não altera regras do Firestore nem coleções de dados.
