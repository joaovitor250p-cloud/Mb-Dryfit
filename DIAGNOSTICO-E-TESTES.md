# Diagnóstico da correção

## O que está demonstrado pelos prints e pelo código
- As fotos do CSV carregam como prévia no navegador.
- A foto escolhida do computador permaneceu após F5: esse formato de imagem foi persistido.
- URLs HTTPS gravadas no campo `imageData` foram negadas com `permission-denied`. A mensagem não identifica qual condição das regras falhou; sem leitura autenticada das regras PUBLICADAS não é possível declarar uma causa única.
- O `firestore.rules` consultado na branch main do GitHub ainda tinha uma verificação `hasAll([imageData,updatedAt,updatedBy])` capaz de bloquear alterações válidas quando `updatedBy` não muda. O código publicado do Firebase pode ter outras regras, pois não se sincroniza pelo GitHub.
- As regras/versões enviados em outras etapas não comprovaram a persistência das URLs.

## Solução aplicada
- Incluído catálogo de 175 fotos como *fallback de visualização*, apenas para modelos reais com mesmo nome e REF. Não requer escrita no Firestore.
- Persistência por URL: tenta converter para data URI compactada como o upload manual, se CORS permitir. Caso contrário, explica a impossibilidade, sem alegar sucesso.
- Os modelos existentes não são recriados, alterados ou apagados; imagens salvas manualmente têm precedência.
- Ação de corte salva o status antes do histórico e mostra os dois resultados separadamente.

## Testes realizados
- Nomes e referências: 175/175 correspondências exatas com 194 modelos do catálogo CSV. 19 não vinculados.
- Análise sintática TypeScript de todos os arquivos TS/TSX: passou.
- ZIP: conteúdo íntegro.
- Build completo: não realizado devido à indisponibilidade do npm no ambiente.
- Banco Firebase e carregamento remoto de imagens: não testados em execução.

## Atenção
O catálogo de fallback está inserido no bundle público do site. Uma pessoa que examine os arquivos JavaScript poderá recuperar as associações de nomes e URLs; o controle de login protege o acesso pela interface e os dados privados do Firestore, não o conteúdo estático do bundle. Os produtos já são públicos no catálogo externo, mas confirme se isso está de acordo com suas necessidades de privacidade.
