# MB REFERÊNCIAS — atualização de amostras, notas fiscais e celular

Este pacote aplica alterações no código existente do projeto `Mb-Dryfit`. Ele não publica automaticamente no GitHub nem altera dados já salvos no Firebase.

## O que muda

### Amostras
- Adiciona botões separados **Tirar foto** (câmera traseira no celular) e **Galeria**.
- Permite até 3 fotos por amostra.
- A primeira foto é a principal e continua sendo a imagem exibida no cartão e em Cortes.
- Fotos adicionais podem ser abertas pelas setas no visualizador. Se a foto principal for removida, a próxima vira a principal.
- As imagens novas são compactadas para reduzir o peso total salvo.

### Gastos
- Adiciona o campo opcional **Nota fiscal**, com câmera e galeria.
- A foto não aparece na lista. Para vê-la, a pessoa abre/clica no gasto.
- A nota fiscal pode ser ampliada; é possível removê-la ou trocá-la ao editar o gasto.

### Celular e desempenho
- A tela de Modelos e Referências passa a mostrar dois cartões por linha no celular.
- As imagens das amostras são carregadas com prioridade baixa e decodificação assíncrona.
- Evita procurar o modelo correspondente repetidamente para cada cartão.
- Memoriza contadores e seleções derivados, e remove a animação de entrada dos cartões de gastos.
- Mantém o limite das novas fotos de amostras em 3 imagens compactadas, com tamanho total máximo de aproximadamente 190 KB por registro.

## Como aplicar no Windows

1. Faça uma cópia de segurança do projeto ou confirme que está atualizado no GitHub.
2. Extraia este ZIP em qualquer pasta.
3. Abra o terminal na pasta local do projeto `Mb-Dryfit` — a pasta que contém `package.json` e `src`.
4. Execute o script usando o caminho completo onde você extraiu este arquivo. Exemplo:

   ```powershell
   node "C:\Users\SEU_USUARIO\Downloads\mb_patch_pkg\apply_mb_updates.mjs"
   ```

   Se você extraiu o ZIP diretamente na raiz do projeto, use:

   ```powershell
   node .\apply_mb_updates.mjs
   ```

5. O script verifica todos os trechos antes de gravar qualquer alteração. Se algum trecho não corresponder à versão do projeto, ele para sem modificar os arquivos.
6. Se aplicar com sucesso, serão criados backups com o sufixo `.backup-before-mb-update`.
7. Execute:

   ```powershell
   npm run build
   ```

8. Se a compilação terminar sem erros, confira as alterações e faça commit/push para a branch `main`. Aguarde o GitHub Actions terminar antes de testar o site.
9. No computador, abra o site e pressione `Ctrl + Shift + R`. No celular, teste em uma aba anônima.

## Importante

- O pacote não exclui nem migra os registros existentes. As amostras antigas continuam usando a foto principal atual.
- As fotos são armazenadas compactadas no próprio documento Firestore para não exigir uma nova coleção nem regras novas. Como o app usa atualizações em tempo real, muitos registros com fotos ainda podem pesar na rede; para uma melhoria estrutural futura, a melhor solução é guardar as imagens no Firebase Storage e carregar as fotos adicionais somente quando forem abertas.
- A conexão do GitHub usada nesta conversa permite leitura, mas não escrita no repositório. Por isso o pacote contém o aplicador local; não foi publicado automaticamente.
