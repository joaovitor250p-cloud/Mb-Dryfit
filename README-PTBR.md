# MB REFERENCIAS — versão 4.11

Este pacote contém o projeto completo do MB REFERENCIAS. As alterações não publicam automaticamente no GitHub e não alteram os dados do Firebase até que você publique o site e as regras.

## O que mudou na versão 4.11

### Catálogo de modelos
- Botões separados **Câmera** e **Galeria** ao cadastrar ou editar um modelo.
- Os mesmos botões também aparecem na janela **Foto principal do modelo** do catálogo.
- A câmera usa a câmera traseira do celular quando o navegador oferece suporte a `capture="environment"`.
- A imagem é compactada antes de ser enviada ao Firestore; continua sendo uma foto principal por modelo.
- A foto não é enviada até a pessoa clicar em **Salvar modelo** ou **Salvar foto**.

### Amostras
- Até 3 fotos por amostra: uma principal e até duas adicionais.
- A primeira foto escolhida é a principal. Ao removê-la, a próxima assume a posição principal.
- A foto principal fica no documento da OC para aparecer como miniatura na lista.
- As fotos 2 e 3 ficam em `production_samples/{id}/gallery/photo_2` e `photo_3`.
- As fotos adicionais só são consultadas quando a pessoa abre aquela amostra para editar. A lista não carrega a galeria completa de todas as OCs.
- A subcoleção antiga `production_samples/{id}/photos` não é consultada. O campo legado `extraImages` também não é exibido nem apagado automaticamente; isso evita que fotos antigas reapareçam na galeria e preserva os dados existentes. Como esse campo antigo continua no documento, ele ainda pode fazer parte do snapshot até uma migração/limpeza autorizada.
- O card compacto mostra a quantidade de amostras em andamento.

### Gastos
- Campo opcional **Nota fiscal**, com Câmera ou Galeria.
- A nota fiscal fica em `expenses/{id}/attachments/receipt`.
- A imagem só é consultada quando alguém expande os detalhes daquele gasto.
- Abrir o formulário de edição não carrega a nota fiscal e não a apaga. Se a pessoa não selecionar outra imagem, o anexo existente é preservado.
- Se o anexo falhar ao salvar, o sistema informa separadamente que o gasto foi salvo, mantendo o formulário aberto para tentar novamente sem duplicar o lançamento.

### Regras e permissões
- O arquivo `firestore.rules` foi alinhado ao código desta versão.
- As regras permitem ler apenas os documentos `photo_2` e `photo_3` da galeria da OC aberta; consultas gerais da galeria ficam bloqueadas.
- As regras permitem salvar a nota fiscal somente para administrador/editor com permissão de Gastos.
- Foram preservadas as áreas atuais do projeto, inclusive Ordem de Corte e Oficinas.
- O bloqueio padrão continua negando qualquer caminho que não tenha uma regra explícita.

### Desempenho
- As fotos adicionais das amostras deixaram de ser carregadas junto com o snapshot de todas as OCs.
- O catálogo continua com duas colunas no celular.
- O snapshot dos modelos só fica ativo nas telas Catálogo, Amostras e Cortes.
- Imagens usam carregamento tardio e decodificação assíncrona onde apropriado.

## Como publicar corretamente

1. Faça backup do repositório atual e das regras publicadas no Firebase.
2. Substitua os arquivos do projeto pelos arquivos deste pacote, preservando as configurações e segredos próprios do seu ambiente.
3. Abra `firestore.rules` deste pacote e publique o arquivo completo em **Firebase Console → Firestore Database → Regras**. Não cole apenas um trecho. Se você tiver regras personalizadas que não aparecem neste arquivo, faça a conciliação antes de publicar.
4. Na pasta que contém `package.json`, execute:

   ```bash
   npm install
   npm run build
   ```

5. Se o build terminar sem erros, faça commit e push para a branch usada pelo GitHub Pages.
6. Aguarde a publicação terminar. No celular, feche a aba antiga e abra o site novamente; se necessário, teste em uma aba anônima.

## Testes obrigatórios após publicar

- **Catálogo:** cadastrar um modelo usando Câmera; repetir usando Galeria; editar a foto de um modelo existente usando Câmera.
- **Amostras:** criar uma OC com 3 fotos; salvar; fechar; reabrir a mesma OC; confirmar que somente as fotos daquela OC aparecem; remover a principal; salvar e confirmar que a próxima virou principal.
- **Gastos:** cadastrar um gasto com nota fiscal; salvar; abrir os detalhes; ampliar a imagem; editar o valor sem trocar a nota e confirmar que ela continua anexada.
- **Permissões:** testar com administrador e editor autorizado; confirmar que visualizador consegue apenas consultar.
- **Mobile:** conferir o catálogo em duas colunas e testar câmera/galeria em um celular real.

## Observações importantes

- Publicar o site não publica automaticamente as regras do Firestore. As duas etapas são necessárias.
- O código não tem acesso ao Firebase de produção nesta etapa; por isso, não é possível confirmar as permissões reais da sua conta ou do seu projeto.
- As imagens antigas no campo legado `extraImages` não são exibidas, apagadas nem migradas automaticamente. A foto principal existente permanece no campo `imageData`. Se houver muitas OCs antigas com esse campo preenchido, o conteúdo legado ainda pode pesar no snapshot até uma limpeza/migração aprovada.
- As fotos dos modelos ainda estão armazenadas no campo `imageData` dos documentos `models`. Para catálogos muito grandes, uma migração futura para Firebase Storage pode reduzir ainda mais o tráfego, mas exige backup, regras próprias e validação separada.
