# MB REFERENCIAS — Correção de Fotos, Catálogo e Cortes

Este pacote é baseado na versão real disponibilizada no chat e **não altera automaticamente** sua conta Firebase ou o GitHub.

## O que foi corrigido

1. **Catálogo unificado:** um cartão para cada modelo com FOTO + NOME + REF. Não existe aba separada de fotos; importação CSV de modelos e CSV de fotos no próprio catálogo. O mesmo campo `models/{id}.imageData` é usado em Cortes e Amostras como foto de fallback. Os IDs, nomes, referências e registros no Firebase são mantidos.
2. **Importação de CSV de fotos:** valida nomes e REF antes de permitir selecionar; impede substituição silenciosa. Confere se a imagem externa carrega. Salva link HTTPS via transação e tenta confirmar a leitura no servidor. Mostra contador de progresso e o motivo real quando o Firestore rejeita a alteração. **Itens com erro permanecem selecionados para nova tentativa**, em vez de desaparecerem. Modelos já salvos aparecem no mesmo cartão.
3. **Foi pra loja:** ação mantém a OC e altera somente status, datas e autoria em `production_samples`. A auditoria continua sendo criada na mesma operação atômica. Erros de regras (permission-denied), sessão ou conexão são explicados.
4. **Regras compatíveis:** arquivo `firestore.rules` aceita foto por URL HTTPS e transições de status `in_progress`, `done` e `store`; inclui uma exceção de atualização limitada para registros antigos sem campos opcionais. Acesso continua limitado a usuários autorizados, e edição somente para admin/editor.

## IMPORTANTE — Por que as fotos não fixavam?

A versão anterior escondia qualquer erro da gravação como `Erro ao salvar no Firestore` e desmarcava as fotos mesmo quando todas falhavam. As regras *publicadas* no Firebase (que não podemos ler por este ZIP) podem ainda não permitir URLs HTTPS em `imageData`. O mesmo acontece com o status `store` se a regra publicada aceitar apenas `done` e `in_progress`, ou se o documento legado tiver um esquema incompleto. **Alterar apenas o ZIP no GitHub não altera as regras publicadas no Firebase.**

## Como instalar SEM Node ou VS Code no computador

1. Entre no MB REFERENCIAS e exporte um **Backup JSON** do catálogo antes de começar.
2. Abra Firebase Console > projeto `mb-referencias` > Firestore Database > Regras. **Copie as regras atuais para um arquivo de backup.** Compare com `firestore.rules` deste pacote: preserve quaisquer regras personalizadas que você tenha feito. Publique as regras corrigidas, mantendo `request.auth`, `user_roles`, roles e a negação final. Consulte também `FIRESTORE-ATUALIZACAO-SEGURA.txt`.
3. Extraia este ZIP, envie os arquivos internos para a raiz do repositório `joaovitor250p-cloud/Mb-Dryfit`, inclusive `.github/workflows/deploy.yml`.
4. Verifique GitHub > Actions > **Publicar MB REFERENCIAS**. Se o build estiver verde, atualize `https://joaovitor250p-cloud.github.io/Mb-Dryfit/` com Ctrl+Shift+R.
5. Abra **Catálogo de modelos**: agora a imagem, o nome e REF ficam juntos. Use **Importar CSV de fotos** e selecione o seu `fotos-modelos-MB-REFERENCIAS.csv` original.
6. **Teste primeiro só 1 ou 2 fotos**, desmarcando as demais, e confirme. Veja o resultado e o cartão correspondente. Só então importe as restantes.
7. Em Cortes, marque uma OC como Pronto e depois como **Foi pra loja**. O status deve mudar automaticamente e continuar após atualizar. Se não mudar, leia a mensagem de erro e confira as regras *publicadas*.

## Segurança e limitações

- Fotos por URL continuam hospedadas no servidor de origem, e só são visíveis enquanto o link permanecer público. Este sistema não faz download ou upload dessas imagens para Cloud Storage.
- `storage.googleapis.com/nexapp-flutter.appspot.com/...` é uma URL HTTPS pública. Imagens que abrem no navegador podem ser exibidas como miniaturas sem precisar de acesso CORS para leitura de pixels.
- A correspondência CSV é estrita por nome e REF. Modelos diferentes podem compartilhar REF; isso não causa fusão.
- O arquivo `firestore.rules` tem regras para perfis autorizados. **Não configure `allow read, write: if true`.**
- A confirmação de status usa uma escrita atômica do corte + histórico; se o Firestore negar alguma delas, o status não é alterado, e uma mensagem é exibida.
- O pacote não inclui dados privados do seu Firebase; seus cadastros existentes permanecem no banco. As fotos importadas anteriormente com sucesso não são sobrescritas.

## Verificação executada

- Análise estática/parse TypeScript TSX: sem erros de sintaxe nos componentes do projeto.
- Presença de `package.json`, `vite.config.ts`, `tsconfig.app.json` e `.github/workflows/deploy.yml` confirmada.
- Verificação estrutural do ZIP: aprovada.
- **Não** foi possível executar `npm install` nem `npm run build` neste ambiente porque `registry.npmjs.org` não resolve (sem acesso ao registro). O GitHub Actions fará o build real. Não considere o projeto testado em produção até os testes acima.
