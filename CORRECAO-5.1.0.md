# MB REFERÊNCIAS 5.1.0

## Correções incluídas

1. O formulário de edição da amostra abre imediatamente com os dados principais do registro. A leitura das fotos adicionais acontece depois e não bloqueia mais a abertura.
2. Se o Firebase negar ou falhar ao consultar as fotos adicionais, o formulário continua disponível para editar OC, nome da peça, REF e costureiro.
3. Quando a galeria não puder ser consultada, os controles de alteração de fotos ficam bloqueados e o salvamento preserva as fotos adicionais já existentes no Firestore. Isso evita apagar fotos que o formulário não conseguiu carregar.
4. O visualizador de fotos em computadores aproveita melhor a área disponível e mantém a imagem inteira, sem recorte (`object-fit: contain`).

## Arquivos alterados

- `src/SampleWorkflow.tsx`
- `src/PhotoLightbox.tsx`
- `package.json` (versão 5.1.0)

## Publicação

1. Faça backup do projeto atual.
2. Substitua os arquivos do projeto pelos arquivos desta versão.
3. Publique pelo fluxo habitual do GitHub Actions.
4. Faça um teste em Amostras: abra uma OC, altere o nome ou a REF e salve.
5. Teste a galeria separadamente. Se aparecer aviso de permissão, revise as regras do Firestore para `production_samples/{sampleId}/gallery/{photoId}`.

A alteração não modifica documentos existentes nem altera as regras do Firebase.
