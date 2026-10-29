# MB REFERENCIAS 4.2 — Correção do build e Ordem de Corte integrada

## Antes de publicar

Faça um backup JSON do Catálogo e das OCs atuais. **Nada foi alterado automaticamente no seu Firebase ou GitHub**.

### 1) Firebase primeiro — regras, sem substituir outros sistemas

- Abra Firebase Console → Firestore Database → Regras e **copie as regras atuais** para um arquivo seguro.
- Leia `PATCH-REGRAS-4.2-ADICIONAR.txt` e aplique somente as duas mudanças: incluir a permissão `orders` em `validSections` e adicionar a regra para a nova coleção `cut_orders`.
- `firestore.rules` incluído no ZIP é uma **referência** a partir do projeto anterior e pode conter regras de sistemas antigos. **Não copie por cima do Console sem conferir.**
- Publicar as regras não apaga modelos, amostras nem contas.

### 2) GitHub — publicar o código

- Extraia o ZIP completo e envie o conteúdo das pastas para `joaovitor250p-cloud/Mb-Dryfit` na branch `main`. O site depende das variáveis já cadastradas no GitHub Actions.
- Verifique `Actions → build` (npm run build) e, depois de ficar verde, atualize o site com `Ctrl+Shift+R`.
- O GitHub conectado está em **modo de leitura**; não houve publicação automática.

### 3) Ordem de Corte — uma nova área do menu

- Na conta de administrador, abra **Ordem de Corte**. A nova coleção estará vazia inicialmente para não duplicar dados reais.
- Faça backup do projeto, confira a autorização e clique **Importar planilha (720)**. Um diálogo pede confirmação antes de salvar no Firestore.
- São 720 linhas históricas distintas; a OC 148 repetida mantém dois registros. Datas legadas com erros permanecem visíveis para conferência e podem ser corrigidas no editor.
- Na tabela do notebook, dê **três cliques** num cartão/linha ou no botão `3× editar`. No celular, segure o dedo cerca de 0,8 s.
- Na ficha, altere datas, peças, costureiro, quantidade, preço, defeitos, desconto por peça e valor. **Desconto total** é automático. Datas da planilha que estiverem incorretas devem ser corrigidas antes de salvar a OC.
- A data de envio nova ou alterada calcula **10 dias corridos** como previsão, que pode ser ajustada manualmente.
- Para pagamentos, abra **Pagamento de sexta-feira**. O total é agrupado por costureiro (Dário e Dario Medina separados). Registros antigos com pagamento inconsistente aparecem em “conferir”; não são somados como dívida sem validação.
- Marcar como Pago grava a situação `OK` e data de hoje, após confirmação. **Não faz transferências bancárias**.
- No menu Contas, administrador pode liberar **Ordem de Corte** separadamente para perfil Consulta ou Editor.
- Em Cortes → Prontos, permanece **Voltar para andamento**.

### 4) Limites do plano gratuito

- Usa Firestore e Firebase Authentication, sem Cloud Functions e sem Blaze. Respeita as cotas gratuitas do Spark. A importação histórica grava até 720 documentos e há leituras ao abrir a página.
- A importação só deve ser feita após comparar os dados com a planilha original; o arquivo vem incorporado ao pacote para facilitar a instalação.

### 5) Testes e limitações

- Diagnóstico do GitHub Actions falho: 12 erros de TypeScript em `src/AccountsAdmin.tsx`, relacionados a `auth`/`db` que podiam ser null; valores locais imutáveis agora são verificados antes das funções assíncronas.
- Os novos `CutOrders.tsx` e `AccountsAdmin.tsx` passaram numa verificação de tipos isolada com declarações de teste; a verificação sintática completa passou.
- **Não houve `npm run build` completo neste ambiente**, por indisponibilidade das dependências npm. O GitHub Actions será o teste definitivo.
- **Não houve testes no seu Firebase real** e não executamos nenhum pagamento/importação.
