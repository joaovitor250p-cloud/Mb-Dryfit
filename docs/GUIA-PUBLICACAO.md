# Guia de publicação — MB REFERENCIAS 4.14

1. Faça uma cópia de segurança do repositório atual.
2. Substitua os arquivos pelo conteúdo deste pacote, sem alterar os dados do Firebase.
3. No GitHub, confirme que os seis Secrets `VITE_FIREBASE_*` estão configurados.
4. Envie os arquivos para a branch `main`.
5. Abra **Actions** e acompanhe o workflow **Publicar MB REFERENCIAS**.
6. Só considere a atualização publicada quando as etapas `npm run build` e `deploy` terminarem com sucesso.

## Testes depois da publicação

- Abrir Catálogo, Amostras, Cortes, Ordem de Corte, Gastos, Informações MB e Oficinas.
- No Catálogo, abrir a câmera e a galeria e salvar uma foto de modelo.
- Em Amostras, conferir uma OC com 1, 2 e 3 fotos; a principal fica na frente e as demais atrás.
- Editar uma OC, remover uma foto e salvar; confirmar que as demais permanecem na ordem correta.
- Trocar de área e voltar; confirmar que pesquisa, filtros e posição da lista são restaurados.
- Abrir Backup/Exportar e testar importação de XLSX/CSV somente quando necessário.

## Firebase

A versão 4.14 não altera o formato das coleções nem exige novas regras Firestore. Mantenha as regras que já foram publicadas e funcionando.
