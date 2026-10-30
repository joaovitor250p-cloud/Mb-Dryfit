# MB REFERÊNCIAS — versão 4.9

Este ZIP contém o código-fonte atualizado do sistema. As alterações são locais ao projeto: **não publicam automaticamente no GitHub e não modificam os dados já salvos no Firebase**.

## Alterações

### Amostras
- Botões separados **Câmera** e **Galeria**.
- A galeria do aparelho permite selecionar mais de uma foto de uma vez.
- Até 3 fotos por amostra, compactadas antes de salvar.
- A primeira foto é sempre a principal. Se for removida, a próxima assume.
- Fotos adicionais ficam em documentos separados no Firestore e são carregadas quando a amostra é aberta para edição.
- A foto principal continua no documento da amostra para preservar a compatibilidade com os cartões e dados antigos.

### Gastos
- Campo opcional **Nota fiscal**, com câmera ou galeria.
- O cartão do gasto pode ser aberto pelo nome/valor/data.
- Observações e nota fiscal aparecem somente quando o gasto é expandido.
- A nota fiscal pode ser ampliada, trocada ou removida durante a edição.
- A imagem fica em uma subcoleção separada e não é baixada junto com a lista de gastos.

### Celular e desempenho
- Catálogo de Modelos e Referências com dois cartões por linha no celular.
- Amostras e Cortes mantêm cartões em uma coluna para facilitar a leitura dos dados operacionais.
- Busca de modelo otimizada com mapa em memória.
- A consulta de todos os modelos é encerrada nas telas que não precisam do catálogo.
- Contadores e seleções derivados memorizados.
- Imagens com carregamento tardio e decodificação assíncrona.
- Removida a animação repetida dos cartões de gastos.
- O histórico de alterações das amostras não duplica o conteúdo base64 das fotos.

## Como atualizar o sistema

1. Faça backup do projeto atual e confirme que os arquivos estão sincronizados com o GitHub.
2. Substitua os arquivos do projeto pelos arquivos deste pacote, preservando os arquivos de configuração e segredos do seu ambiente.
3. Antes de publicar o site, abra `firestore.rules` neste pacote e atualize as regras no Firebase Console. Faça backup das regras atuais e compare qualquer regra personalizada antes de substituir.
4. No terminal, dentro da pasta que contém `package.json`, execute:

   ```bash
   npm install
   npm run build
   ```

5. Se o build terminar sem erros, faça commit e push para a branch `main`.
6. Aguarde o GitHub Actions terminar e teste o site atualizado. No navegador, use `Ctrl + Shift + R`; no celular, teste em uma aba anônima.

## Importante sobre o Firebase

Esta versão usa duas subcoleções novas:

- `production_samples/{id}/photos` para as fotos adicionais das amostras.
- `expenses/{id}/attachments/receipt` para a nota fiscal de cada gasto.

As regras correspondentes já estão incluídas em `firestore.rules`. **Se o código for publicado sem publicar as regras atualizadas, as operações de salvar, consultar ou remover essas imagens poderão retornar `permission-denied`.**

Nenhum registro antigo é migrado ou excluído automaticamente. As amostras antigas continuam usando a foto principal já cadastrada.

## Limite de desempenho conhecido

As fotos antigas dos modelos ainda estão no campo `imageData` dos documentos da coleção `models`, que é carregada em tempo real. Para catálogos muito grandes, o próximo passo recomendado é migrar essas imagens para Firebase Storage com backup e validação, mantendo no Firestore apenas URLs e metadados. Essa migração não foi feita nesta atualização para preservar os arquivos existentes.

Consulte `ANALISE-DE-DESEMPENHO.md` para o diagnóstico técnico e o roteiro de testes.
