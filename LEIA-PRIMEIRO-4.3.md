# MB REFERENCIAS 4.3 — Edição sem abertura acidental e sessões independentes

## O que mudou
- Ordem de Corte: removido totalmente o gesto de pressionar/segurar (800 ms) que abria a ficha ao rolar os cartões no celular.
- O botão **Editar** abre a OC com **um toque/clique**. Também continuam válidos três cliques/toques no próprio registro.
- No celular, deslizar a página não deve mais abrir a edição.
- No login/cadastro, configurada persistência local da autenticação (`browserLocalPersistence`) para cada navegador/aparelho, sem lógica de sessão única ou revogação de outros aparelhos.

## Importante sobre uma conta em vários aparelhos
O Firebase Authentication normalmente já permite acessar o mesmo e-mail e senha simultaneamente de diferentes celulares. Não existe mecanismo de desconexão remota por novo login no código revisado. O comando "Sair" encerra a sessão apenas do aparelho/browser que o acionou. Não podemos comprovar o resultado real sem testar seu Firebase em dois aparelhos. Se alguém alterar a senha, o Firebase pode invalidar sessões anteriores por segurança. Em abas do mesmo navegador e domínio, a autenticação local é sincronizada.

**Segurança:** mais de uma pessoa usando o mesmo login compartilha permissões e histórico. Para rastrear quem realizou cada alteração, mantenha contas individuais aprovadas pelo administrador, que é uma opção gratuita.

## Como publicar
1. Faça backup dos dados antes de enviar versões novas.
2. Envie o projeto 4.3 completo ao GitHub ou substitua somente `src/CutOrders.tsx`, `src/App.tsx` e `src/styles.css`.
3. Espere a ação `npm run build` ficar verde. O projeto de origem inclui as regras e os dados da versão 4.2.
4. No celular, atualize a página (se necessário, limpe o cache). Teste deslizar sobre Editar, depois tocar Editar, e testar três toques no registro.
5. Faça login com o mesmo e-mail em dois celulares e confirme se ambos ficam ativos.

Não há alterações nas regras do Firestore nem nos modelos/fotos ou no conteúdo da Ordem de Corte.
