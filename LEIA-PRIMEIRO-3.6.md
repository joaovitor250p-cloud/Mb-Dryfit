# MB REFERENCIAS 3.6 — Catálogo simplificado, exportação, zoom e CSV inicial

Esta atualização **não apaga nem recria** coleções do Firebase e **não exige alterar as regras** para os recursos existentes, desde que estejam ativas as permissões do projeto atual sobre `models`, `production_samples`, `user_roles` e `audit_log`.

## O que mudou

- No **Catálogo**, apenas três ações principais: **Backup / Exportar**, **Selecionar cartões** e **Novo modelo**. A importação de planilhas e exportação Excel foram retiradas da barra lateral.
- **Backup / Exportar** escolhe os dados (modelos, cortes e, para administradores, usuários e histórico), os campos (modelo, REF, imagem/link, OC, costureiro, status e datas) e o formato (Excel ou JSON). Um backup JSON contém fotos incorporadas salvas no Firestore. No Excel, fotos compactadas aparecem como aviso; links públicos aparecem como URLs — o pacote `xlsx` não insere a imagem como fotografia dentro da planilha.
- **Fotos ampliáveis:** clique nas fotos do catálogo, amostras e cortes. Janela em tela cheia, zoom de 100 a 500%, arraste para examinar e Escape para fechar.
- **Amostras:** somente registros em `in_progress`. Quando o botão Pronto de Cortes altera o status para `done`, a OC desaparece de Amostras; continua em Cortes → Prontos. Reabrir traz de volta às Amostras.
- **Importar CSV inicial** (Cortes, **apenas administrador**): CSV/XLSX com OC, nome de modelo, REF (opcional) e costureiro. Prévia, aviso de repetidos, validação, criação somente de OCs que ainda não existem. Após finalizar é gravado o marcador `audit_log/mb_referencias_csv_inicial_ocs` para desativar a opção. Caso uma importação falhe no meio, uma nova tentativa ignora os já cadastrados e continua o restante. Não é um backup nem substitui dados existentes.
- **Selecionar cartões** continua disponível tanto no Catálogo como em Cortes; exclusão exige digitar EXCLUIR e mantém OCs e modelos independentes.
- As 175 fotos iniciais do CSV e as fotos manuais do Firebase são preservadas.

## Publicar pelo navegador

1. Antes de substituir os arquivos, use **Backup / Exportar → JSON** no site atual e guarde o arquivo em local privado.
2. Extraia o ZIP. Envie **os arquivos e pastas internos** à raiz do repositório `joaovitor250p-cloud/Mb-Dryfit` na branch `main`. Inclua `.github` e `src` e evite criar uma pasta adicional acima deles.
3. Confira **GitHub → Actions → Publicar MB REFERENCIAS**. Somente após `build` e `deploy` ficarem verdes, atualize o site com `Ctrl + Shift + R`.
4. Teste uma OC já existente: **Cortes → Em andamento → Pronto**. Abra Amostras: a OC não deve aparecer. Reabra a OC: ela volta à lista de amostras.
5. Clique em uma imagem e teste aumentar/diminuir o zoom.
6. Teste Backup / Exportar com um Excel (modelo, REF e costureiro) e com um backup JSON. Depois valide a importação inicial com CSV *real* e revisão da prévia, **somente quando quiser concluir a configuração uma única vez**. O arquivo `exemplos/CSV-INICIAL-DE-OC.csv` contém apenas o cabeçalho esperado.

## Limitações e segurança

- **Não foi executado `npm run build` nesta sessão:** `npm install --offline` falhou por falta de pacotes no cache e `npm install` online não concluiu porque o registro npm estava inacessível. A verificação sintática de TypeScript/TSX passou. O GitHub Actions será o teste completo de compilação.
- O script não tem acesso ao seu Firestore real; a persistência do marcador e dos novos documentos precisa ser confirmada no aplicativo com login autorizado. A regra atual de `audit_log` deve permitir a criação do marcador para administradores; se essa regra tiver sido modificada na produção, o aplicativo mostrará erro.
- A marcação de importação inicial é persistida no banco e não deve ser excluída para refazer uma carga. Se houver falha de conexão, importe novamente o mesmo CSV para retomar sem sobrescrever as OCs já cadastradas.
- **Exportações de usuários/histórico e backups JSON podem conter informações pessoais. Não os publique no GitHub.**
- Há uma regra legada potencialmente insegura no Firestore (`allow get: if true` em `/usuarios/{whatsapp}`) herdada da versão anterior. Esta atualização não a modifica; revise a migração de segurança separadamente.
