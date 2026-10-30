# Relatório técnico — MB REFERENCIAS 4.11

## Catálogo de modelos: câmera

- O formulário de novo/editar modelo agora oferece botões separados para Câmera e Galeria.
- A janela de edição rápida da foto principal no Catálogo também oferece os dois caminhos.
- A câmera usa `<input type="file" accept="image/*" capture="environment">`; a galeria usa um seletor normal.
- As imagens continuam passando por `optimizePhoto` antes de serem salvas. O limite do campo `imageData` no Firestore permanece alinhado ao limite de 90.000 caracteres das regras.
- A gravação só acontece após confirmação explícita no botão Salvar.

## Amostras: galeria isolada por OC

### Problema da arquitetura anterior

As imagens extras eram guardadas no campo `extraImages` do documento principal. Como a tela usa um snapshot de `production_samples`, todas as fotos extras eram baixadas junto com a lista. Além de aumentar o tráfego, o app podia exibir dados antigos que já estivessem naquele campo.

### Arquitetura 4.11

- `production_samples/{id}.imageData`: foto principal e miniatura do cartão.
- `production_samples/{id}/gallery/photo_2`: segunda foto.
- `production_samples/{id}/gallery/photo_3`: terceira foto.
- O formulário lê apenas os dois IDs conhecidos da OC que a pessoa abriu.
- Não é feita consulta `list` da subcoleção `gallery`.
- A subcoleção antiga `photos` não é lida; as regras permitem somente a limpeza dos IDs antigos conhecidos ao excluir uma OC.
- O campo legado `extraImages` é aceito pelas regras para compatibilidade, mas o novo código não o exibe, não grava nele e não o apaga automaticamente. Como o campo continua no documento, dados antigos ainda podem ser transmitidos pelo snapshot até uma migração/limpeza autorizada.
- Ao salvar, a foto principal é atualizada no documento e os dois documentos conhecidos da galeria são atualizados/removidos de acordo com as fotos escolhidas.
- Se a gravação da galeria falhar depois de salvar a OC, o formulário permanece aberto e passa a editar a OC criada, evitando duplicidade em uma nova tentativa.

## Gastos: nota fiscal

- A nota fiscal continua isolada em `expenses/{id}/attachments/receipt`.
- O snapshot da coleção `expenses` não carrega imagens.
- `getDoc` do anexo só ocorre ao expandir o gasto.
- Editar nome, valor, data ou observações não exige ler nem regravar a nota fiscal existente.
- As regras permitem `get` do documento conhecido `receipt`, bloqueiam `list` e limitam gravação a quem tem permissão de escrita em `expenses`.

## Regras do Firestore

O arquivo completo mantém as permissões do projeto e acrescenta:

- `production_samples/{id}/gallery/{photoId}` com `get` somente para `photo_2`/`photo_3`, sem `list`.
- Criação/atualização das fotos da galeria somente para `canWrite('samples')`, com validação do formato, tamanho e autor.
- Exclusão dos IDs conhecidos da galeria somente para quem pode editar Amostras.
- `expenses/{id}/attachments/receipt` com leitura por quem pode visualizar Gastos e gravação por quem pode editar Gastos.
- Preservação da área `workshops`, que já é usada pelo código atual.
- Regra padrão `allow read, write: if false` para caminhos não previstos.

## Card de quantidade

A tela Amostras mantém o card compacto com a contagem de registros em andamento. O valor é derivado do snapshot já carregado, sem consulta extra.

## Limitações conhecidas

- A lista principal de amostras ainda baixa a foto principal (`imageData`) de cada OC, pois ela é usada como miniatura dos cartões. As fotos 2 e 3 não são baixadas até abrir a OC.
- Os documentos antigos que ainda possuem `extraImages` não são migrados nem apagados automaticamente. Esse campo não é exibido pela versão 4.11 para impedir que fotos antigas inesperadas reapareçam.
- As fotos do catálogo de modelos continuam no Firestore. Uma migração para Firebase Storage é uma melhoria futura separada.
- Não foi possível validar o acesso contra o Firebase de produção, pois não há sessão administrativa do projeto disponível neste ambiente.
