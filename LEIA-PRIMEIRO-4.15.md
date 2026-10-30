# MB REFERENCIAS 4.15 — leia antes de publicar

Esta atualização acrescenta zoom e navegação na galeria, gestos para trocar de área e uma tela de carregamento com a logo oficial.

## O que mudou

- Clique em uma foto para abrir a visualização ampliada.
- No notebook, use `+`, `−`, `100%`, a roda do mouse ou dois cliques para controlar o zoom.
- Arraste uma imagem ampliada para mover o enquadramento.
- Nas Amostras, abra uma OC com até três fotos e deslize para os lados para navegar entre elas. As setas e as teclas esquerda/direita também funcionam.
- A pilha visual das fotos secundárias atrás da principal foi mantida.
- Em telas sensíveis ao toque, deslize na área principal para ir à próxima ou à seção anterior; a mudança tem animação suave.
- A tela inicial usa a logo MB Dri-Fit com animação.
- Os textos exibidos no site e a documentação de uso não mostram o nome do provedor técnico.

## Publicação

1. Faça backup do repositório atual.
2. Substitua os arquivos pelo conteúdo de `Mb-Dryfit-main`.
3. Preserve as credenciais de conexão já cadastradas no GitHub.
4. Envie para a branch `main` e confira o resultado em Actions.
5. Considere a atualização concluída somente depois que o build e a publicação terminarem com sucesso.

## Dados e regras

Não há alteração nas coleções, nos documentos, nas fotos armazenadas ou nas permissões. Não publique regras novas para esta atualização.

## Nota técnica

A integração de autenticação e dados permanece como dependência interna do sistema. O nome do provedor foi removido da interface e dos textos de uso, mas remover a dependência técnica por completo exigiria migrar login, banco de dados, permissões e fotos para outro serviço.
