# MB REFERÊNCIAS 4.6 — Importação das planilhas de Gastos e Informações MB

## Por que as telas estavam vazias

As páginas já consultavam as coleções `expenses` e `mb_info` do Firestore, mas a planilha local não havia sido gravada nessas coleções. Regras do Firestore autorizam operações; elas não importam planilhas sozinhas.

## O que esta versão adiciona

- Botão **Importar CSV da planilha** na página Gastos.
- Botão **Importar CSV da planilha** na página Informações MB.
- Leitura de CSV separado por ponto e vírgula, em UTF-8 ou Windows-1252 (codificação dos arquivos enviados).
- Conferência dos cabeçalhos antes de importar.
- Importação autenticada diretamente do navegador para o Firestore.
- IDs estáveis por linha de origem; ao selecionar o mesmo arquivo novamente, os registros já importados são ignorados e não sobrescritos.
- Os dados existentes e os registros adicionados manualmente não são apagados.
- Regras do Firestore com permissões para `expenses` e `mb_info`, preservando o controle por usuário/área.

## Importar os arquivos enviados

1. Publique o código deste projeto pelo repositório GitHub e aguarde o GitHub Actions concluir.
2. No Firebase, publique as regras do arquivo `firestore.rules` deste pacote, caso as regras atuais ainda não tenham as permissões das coleções `expenses` e `mb_info`. Confirme que está no projeto Firebase correto.
3. Entre no site com uma conta administradora/editor autorizada.
4. Abra **Gastos** → **Importar CSV da planilha** e selecione `GASTOS (OUTUBRO)(Planilha1).csv`.
5. Confirme a importação. O arquivo enviado contém 70 lançamentos válidos.
6. Abra **Informações MB** → **Importar CSV da planilha** e selecione `INFORMAÇÕES(Planilha1).csv`.
7. Confirme a importação. O arquivo enviado contém 13 registros de funcionários.
8. As listas devem atualizar automaticamente quando o Firestore confirmar as gravações.

## Privacidade

Os CSVs contêm dados financeiros e chaves PIX/contatos. **Não os adicione ao repositório público do GitHub nem os incorpore ao código da aplicação.** Selecione os arquivos na própria tela de importação; os dados são enviados à coleção protegida do Firestore através da sessão autenticada.

## Se a importação for negada

- Confirme que a conta tem permissão de edição e que as áreas `expenses` e `info` estão autorizadas no perfil.
- Confirme que as regras foram publicadas no mesmo projeto Firebase configurado na aplicação.
- Não use regras abertas (`allow read, write: if true`).

## Testes

- Parser e conversão das duas planilhas: 70 gastos e 13 registros de funcionários reconhecidos localmente.
- A importação real no Firebase depende de você executar os passos acima com sua sessão autenticada; não foi executada neste ambiente.
- O build completo do Vite/TypeScript não pôde ser executado aqui porque a instalação das dependências do npm expirou sem concluir. A sintaxe dos arquivos será verificada separadamente.
