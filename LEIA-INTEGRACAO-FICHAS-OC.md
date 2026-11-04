# Integração de Fichas de Produção, Preços e Ordem de Corte

## Publicação
1. Faça backup do Firestore e do projeto antes de substituir o sistema.
2. Publique as regras atualizadas de `firestore.rules` no Firebase Console.
3. Instale dependências com `npm install` e execute `npm run build` antes de publicar.
4. Na aba **Preços de REF**, clique **Importar lista inicial das 100 referências** (apenas uma vez). O importador preserva valores já cadastrados.
5. Na aba **Oficinas**, clique **Importar 9 costureiros** (apenas uma vez). Os já existentes não serão duplicados por nome. Confira tipos de peças, WhatsApp, PIX e preços especiais.
6. Autorize a pessoa responsável por distribuição com a permissão `sheet_distribution`. Ela não precisa de permissão para editar OCs; a regra autoriza apenas a criação da OC vinculada à ficha distribuída.

## Funcionamento
- Nildo preenche e envia a ficha **sem preço**.
- Distribuidor escolhe o tipo e o costureiro; o preço padrão ou especial é sugerido, podendo ser editado.
- REF/tipo não cadastrado exibe alerta; exige preço manual válido. Cadastre a nova REF em **Preços de REF** para reutilizá-la.
- A confirmação grava ficha atribuída e OC em uma operação atômica Firestore. O ID da OC é o ID da ficha, impedindo repetição da mesma ficha.
- A pessoa autorizada em Ordem de Corte pode editar pagamento e demais campos.
- A impressão contém o nome do costureiro; desmarque **Cabeçalhos e rodapés** na caixa de impressão do navegador.

## Atenção
- **Não foi possível executar npm install/npm run build neste ambiente**, pois os pacotes não estão em cache. O código foi verificado quanto à sintaxe TypeScript/JSX, mas exige teste funcional com Firebase antes da publicação.
- Não há prevenção de números OC repetidos entre fichas diferentes; a proteção é por ficha.
- O cadastro de preços contém 100 combinações tipo/REF transcritas e revisadas na conversa. A entrada sem REF legível não foi importada.
- A impressão em A4 pode precisar de ajuste se forem inseridas muitas cores ou textos longos.
