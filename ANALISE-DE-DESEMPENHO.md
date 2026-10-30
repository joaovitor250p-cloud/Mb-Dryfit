# Análise técnica — MB REFERÊNCIAS

## Causas observadas no código

1. `SampleWorkflow.tsx` mantém um listener em tempo real para toda a coleção `production_samples`. Isso é conveniente para sincronização, mas traz todos os documentos e suas fotos compactadas para cada sessão.
2. O cartão de amostra procurava o modelo correspondente com `models.find(...)` várias vezes para cada cartão. Com muitos registros, isso repete trabalho durante as renderizações.
3. Contadores de produção e listas de seleção eram recalculados em toda renderização.
4. A regra CSS geral para telas menores força `.production-grid` para uma coluna. Ela também atingia o catálogo de modelos, mesmo quando o objetivo era mostrar cartões compactos lado a lado.
5. Os cartões de gastos usavam animação de entrada em todos os itens, o que pode causar pequenas travadas em listas maiores.
6. As imagens são salvas como data URLs no Firestore. Mesmo quando o elemento `<img>` usa carregamento tardio, o texto da imagem já veio junto com o documento do Firestore; portanto, `loading="lazy"` melhora a renderização, mas não elimina o tráfego dos dados base64.

## Melhorias incluídas

- Mapa em memória de modelos por nome normalizado, para substituir buscas repetidas dentro de cada cartão.
- `useMemo` para contadores, cartões selecionados e IDs visíveis.
- `loading="lazy"` e `decoding="async"` nas fotos de amostras e nas fotos abertas nos detalhes.
- Compressão das fotos novas de amostras e limite de três fotos por registro para evitar que a galeria aumente indefinidamente o documento.
- Remoção da animação de entrada na lista de gastos.
- Regra CSS mais específica para exibir dois cartões de Modelos e Referências por linha no celular, sem alterar a grade de outras telas.

## Limite da análise

O código da interface foi revisado, mas não foi possível executar o build completo do repositório remoto nesta sessão. Depois de aplicar o pacote, `npm run build` deve ser executado localmente antes de publicar. Para uma otimização maior no futuro, migrar as imagens do Firestore para Firebase Storage reduziria o tamanho dos snapshots em tempo real.
