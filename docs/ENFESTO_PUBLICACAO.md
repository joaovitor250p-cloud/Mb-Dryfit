# Publicação segura — Enfesto e Corte (MB REFERÊNCIAS)

## Ordem obrigatória

1. Verifique se o PR de Enfesto passou na validação de build e testes.
2. Abra o [Firebase Console](https://console.firebase.google.com/) no projeto **MB REFERÊNCIAS**.
3. Vá em **Firestore Database → Regras**.
4. Abra o arquivo [firestore.rules da branch de Enfesto](https://github.com/joaovitor250p-cloud/Mb-Dryfit/blob/feat/enfesto-fichas-producao-20261112/firestore.rules), copie o conteúdo integral e substitua as regras no Console. Antes de clicar Publicar, confira que este é o projeto correto.
5. Clique em **Publicar** e aguarde o aviso de confirmação das regras. **Não publique a interface antes desse passo.**
6. Mescle o PR de Enfesto na branch `main` para acionar o GitHub Pages.
7. Abra **Configurações → Usuários e acessos** e conceda a permissão **Enfesto e corte** somente aos editores responsáveis.
8. Teste com uma ficha nova de pequeno porte:
   - Criar ficha → **Enviar para Enfesto**;
   - Conferir que ela não aparece em Distribuição antes de concluir;
   - Abrir **Enfesto e Corte**, preencher camadas, peso por folha, quantidade cortada e confirmar todas as cores;
   - Escolher o tecido cadastrado, conferir consumo em KG/M e saldo; ou confirmar explicitamente **sem baixa** quando não existir tecido no estoque;
   - Finalizar e verificar que a ficha passou a **Pronta para distribuição**;
   - Distribuir ao costureiro e confirmar que aparece **uma única OC** em **OCs e pagamentos**, com impressão disponível.

## Proteções e compatibilidade

- Fichas já existentes com status `pending` permanecem liberadas para distribuição. Nenhuma ficha legada é migrada, apagada ou editada automaticamente.
- Novas fichas entram com status `enfesto`. Somente o responsável autorizado pode mudar a etapa para `pending` depois de concluir o enfesto.
- As confirmações por cor ficam em `enfesto_jobs/{sheetId}`, com registro de quem concluiu, data e indicação de baixa no estoque.
- Havendo baixa, a confirmação, as movimentações de estoque e a mudança de status da ficha ocorrem **na mesma transação do Firestore**; o identificador estável da ficha impede repetição da baixa pela tela.
- Se o tecido não estiver cadastrado, é possível finalizar **sem baixa**, mediante confirmação explícita; isso é registrado e não cria movimentações fictícias.
- O controle de estoque segue limitado a no máximo cinco combinações de tecido/cor/unidade por finalização integrada para respeitar as verificações das regras de segurança no Spark.
- Não é necessário ativar o plano Blaze. O Firebase permanece sujeito às cotas do Spark.

## Implantação das regras

O workflow GitHub Pages atualmente **não tem credenciais para alterar as regras do Firestore**. Atualizar o arquivo `firestore.rules` no GitHub não publica essas regras automaticamente. Somente publicar o frontend antes das regras causará erros de permissão na criação/finalização das novas fichas.
