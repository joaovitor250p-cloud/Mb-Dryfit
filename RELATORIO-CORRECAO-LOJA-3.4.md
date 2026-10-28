# Relatório — Correção direcionada do botão Chegou na loja

**Fonte analisada:** `src/SampleWorkflow.tsx` e `firestore.rules` presentes no repositório `Mb-Dryfit` e no ZIP da v3.3.

## Erro identificado

- Antes: a ação para `store` omitira `completedAt` e `completedBy`, ao contrário da ação `done`, preservando valores legados que podem ser rejeitados pela validação de tipo do Firestore.
- Agora: ambas as transições enviam os cinco campos. `store` preserva a data de conclusão se for um Timestamp válido; caso contrário, normaliza para `serverTimestamp()`.
- A gravação é feita com `updateDoc` no MESMO documento; a aba muda após a confirmação. Auditoria separada e com erro distinto.
- Regras atualizadas para verificar o tipo dos campos de conclusão se foram alterados na transição. Mantém `done → store` como passagem autorizada e impede escrita pública.

## Arquivos alterados

- `src/SampleWorkflow.tsx`
- `firestore.rules`
- `package.json` (versão 3.4)
- documentação da correção

## Limitações

Sem acesso de escrita ao Firebase/ao GitHub. Não houve deploy, alteração de regras em produção nem teste real de gravação. Não é possível garantir sucesso se a regra publicada ainda rejeitar `store`.
