# MB REFERENCIAS 3.4 — Chegou na loja igual ao Pronto

## O que foi corrigido

O botão **Chegou na loja** usa agora a MESMA gravação de **Pronto**: `status`, `completedAt`, `completedBy`, `updatedAt`, `updatedBy` no documento `production_samples` original. A data de conclusão já válida é preservada ao enviar à loja; OCs antigas recebem uma data válida se necessário. A interface troca automaticamente para a aba de destino após a gravação confirmada.

O histórico (`audit_log`) é gravado depois, de modo que falha de auditoria não desfaça o status já salvo. O botão **Pronto** e a exclusão múltipla continuam disponíveis. As 175 fotos iniciais foram mantidas.

## COMO INSTALAR SEM NODE NO COMPUTADOR

1. Faça backup JSON do Catálogo e das OCs antes de qualquer mudança.
2. Extraia o ZIP e envie o conteúdo para a RAIZ do GitHub `joaovitor250p-cloud/Mb-Dryfit`, substituindo os arquivos iguais. Inclua `src` e `.github`.
3. Na aba Actions, confirme `build` e `deploy` verdes. Atualize com Ctrl+Shift+R.
4. IMPORTANTE: o GitHub Actions não publica as regras do Firestore. Só se a regra ATIVA não aceitar `status: store` será preciso publicar `firestore.rules` no Firebase Console, preservando as regras legadas. Faça backup do texto atual antes de substituir. Nunca publique `allow write: if true`.
5. Use uma OC de teste em Cortes → Prontos → Chegou na loja. O botão muda para a aba **Chegou na loja**, e a OC continua com o mesmo número. Atualize a página para conferir persistência.

## Resultado dos testes

- Código TypeScript/TSX: sintaxe verificada com o parser do TypeScript instalado, sem erro de parsing.
- Continuidade: transições `in_progress → done`, `done → store` e reabertura constam nas regras. As fotos e modelos de 3.3 foram mantidos.
- Build `npm run build` e Firestore real: NÃO testados. npm não tem dependências no cache deste ambiente e a conexão GitHub é somente leitura. Confirme pelo Actions e no sistema.

## Segurança

O arquivo de regras preserva a autorização por `user_roles` (admin/editor) e preserva as regras legadas. Elas contêm `allow get: if true` para `/usuarios/{whatsapp}`, um risco preexistente que precisa de migração separada.
