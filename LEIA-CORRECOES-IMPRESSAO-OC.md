# Correções da ficha e distribuição

- Impressão ajustada para uma folha A4, com Aviamentos mais estreito, mais espaço para as informações da oficina, tabela apenas com cores preenchidas e linha de totais.
- Fichas por costureiro: botão de exportação das OCs da oficina em CSV (abre no Excel).
- Corrigida uma causa identificada de falha da criação automática: a leitura `getDoc(cut_orders/ID)` era executada antes do lote e exigia permissão de leitura de Ordens de Corte que o distribuidor não possui. Essa leitura foi removida; a criação continua protegida pelo ID único e pelas regras de criação do Firestore.
- IMPORTANTE: publique `firestore.rules` no projeto Firebase correspondente e garanta permissão `sheet_distribution` para o usuário que distribui. A criação automática também depende de a ficha estar pendente e das regras em produção serem as mesmas do pacote.
- Para impressão, no diálogo do navegador selecione A4, escala 100%, margens padrão ou nenhuma conforme visualização, e desative cabeçalhos e rodapés.
- O layout foi ajustado por código, mas não foi possível validar a impressão real em navegador ou executar build completo sem as dependências instaladas. Se houver excesso de texto, confira o resultado da impressão antes de enviar.
- O download das OCs por oficina inclui os dados das fichas distribuídas; não inclui campos financeiros posteriores da Ordem de Corte.
