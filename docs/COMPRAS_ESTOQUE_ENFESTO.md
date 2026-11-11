# Compras e Estoque — MB REFERÊNCIAS

## O que foi implementado

- Aba **Compras e Estoque** no menu principal (visível ao administrador; editor precisa da permissão `purchases`).
- Importação de NF-e XML por campos estruturados e PDF com extração de texto via PDF.js, sem API paga.
- Conferência dos itens e das cores antes de registrar a entrada.
- Estoque de materiais por identificação única de material, cor e unidade (KG, M, UN, PC, CX, L, OUT).
- Entrada da nota e histórico de movimentações em **uma transação** do Firestore, com idempotência.
- Boleto PDF e histórico de **Contas a pagar** na mesma aba; vinculável a uma nota.
- Confirmação de consumo do enfesto com **baixa imediata no estoque**, rejeição de saldo negativo e impedimento de baixa repetida para o mesmo identificador.
- Isolamento do novo banco por `companies/{companyId}`; empresa legada `mb-principal`.

## Importante: publicar regras Firebase

O GitHub Pages publica apenas o frontend. A conexão GitHub não publicou regras no Firebase.

1. Abra https://console.firebase.google.com/ e o projeto MB REFERÊNCIAS.
2. Abra **Firestore Database → Regras**.
3. Copie o **conteúdo completo** do arquivo `firestore.rules` atualizado do repositório e clique em **Publicar**.
4. Faça um teste com uma NF pequena e uma baixa com quantidade baixa.

**Não ative Blaze.** No Spark, quando a cota acabar algumas operações podem falhar, sem gerar cobrança por uso do Firebase.

### Limites para preservar integridade e custo zero

- PDF anexado limitado a **390 KB**, armazenado como texto base64 no Firestore. PDFs maiores são recusados, não são anexados silenciosamente.
- XML da NF-e limitado a 2 MB; a importação por documento aceita até 25 itens, mas a confirmação atômica aceita no máximo **7 combinações únicas de material/cor/unidade** para respeitar os limites de verificação de regras do Firestore.
- NF-e XML é interpretada mas sua **assinatura fiscal não é verificada**.
- PDFs digitalizados não possuem texto extraível sem OCR; informe os dados manualmente antes de confirmar.
- A empresa principal é `mb-principal`; para outras empresas, cada usuário precisa de `companyId` associado por administrador. Dados da nova aba não atravessam empresas.

## Integração automática com a confirmação real do enfesto

Esta versão do repositório **não tinha um módulo/tela de enfesto**. Não foi alterado o cálculo de fichas, OCs, amostras ou cortes.

A nova aba contém o botão **Confirmar enfesto e baixar estoque**. Nesse botão, a chamada ocorre no mesmo momento da confirmação e baixa cada material/cor automaticamente.

Foi criada a função pública `confirmEnfestoConsumption` em `src/lib/purchasesInventory.ts`. Quando a tela real de enfesto estiver disponível, a função deve ser chamada **no ato de confirmar o enfesto**, não ao abrir a tela ou calcular o corte:

```ts
import { confirmEnfestoConsumption } from './lib/purchasesInventory';

await confirmEnfestoConsumption({
  db, company: companyId, uid: user.uid,
  confirmationId: enfesto.id, // ID ESTÁVEL de um enfesto real
  oc: enfesto.oc,
  lines: [
    {stockId: tecidoPreto.id, quantity: '12,500'}, // KG ou M segundo o estoque
    {stockId: tecidoAzul.id, quantity: '8,000'}
  ],
  notes: 'Consumo confirmado na mesa de enfesto'
});
```

A função realiza uma única transação contendo confirmação, baixa por cor e histórico, valida saldo disponível e bloqueia uma segunda chamada com a mesma `confirmationId`.

**Não** vincule a baixa ao status `ENTREGUE` de uma OC ou `PRONTO` de uma Amostra: eles não têm os dados de tecido/cor/consumo e descontar nesses eventos causaria erros de estoque.

## Onde os dados ficam

Coleções de cada empresa:
- `companies/{companyId}/purchases`: notas confirmadas.
- `companies/{companyId}/inventory`: saldos de materiais por cor e unidade.
- `companies/{companyId}/stock_movements`: entradas e baixas imutáveis.
- `companies/{companyId}/enfesto_confirmations`: confirmações idempotentes de enfesto.
- `companies/{companyId}/bills`: boletos PDF e contas a pagar.

Nenhuma coleção antiga foi apagada, migrada ou recriada. Os PDFs e dados financeiros são acessíveis apenas segundo as regras de autenticação e empresa do Firestore.

## Próxima integração obrigatória

Para tornar a baixa **automaticamente acionada pela tela de enfesto que você já usa em outro sistema/repositório**, será necessário integrar a chamada acima naquele código, preservando seus cálculos. Isso não pôde ser realizado nesta versão do MB REFERÊNCIAS porque o módulo não existe nesta árvore de arquivos.
