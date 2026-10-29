# MB REFERENCIAS 4.4 — logo, zoom por pinça e áreas editáveis

## Alterações desta versão
- A imagem `src/assets/mb-dryfit-logo.png` é usada como logo na tela de login, na barra lateral e no cabeçalho mobile.
- O zoom da página é bloqueado no viewport mobile e também são bloqueados atalhos/gestos de zoom do navegador fora das fotos. A ampliação da foto ocorre no visualizador com gesto de pinça usando dois dedos; os botões e a barra de zoom foram removidos. Em computadores com trackpad, o gesto de pinça também amplia a foto aberta.
- Ao marcar uma OC como **Pronto**, o sistema não muda automaticamente para a aba/filtro “Prontos”; o usuário permanece na seleção atual de Cortes.
- Amostras e Cortes são ordenados por tipo, nome e OC; o filtro por tipo também aparece em Cortes. “Cam” e “Camiseta” são tratados juntos no filtro principal.
- O número da OC está maior e mais destacado nos cartões.
- Animações sutis foram adicionadas à interface.
- Novas áreas editáveis: **Gastos** (data local preenchida automaticamente, nome, valor e observações) e **Informações MB** (nome, valor, PIX, titular e observações).
- O painel de permissões permite liberar Gastos e Informações MB por usuário.
- `firestore.rules` contém as regras das coleções `expenses` e `mb_info` e os novos escopos de permissão.

## Para publicar
1. Atualize os arquivos do site com o conteúdo deste ZIP.
2. Publique também `firestore.rules` no Firebase (Firestore Database → Rules). Sem isso, as novas abas não poderão gravar/ler dados.
3. Em Contas e Permissões, conceda as áreas **Gastos** e **Informações MB** aos usuários que devem acessá-las.
4. O ZIP inclui o código-fonte, não uma cópia já publicada no domínio. O site ao vivo só muda depois de enviar os arquivos ao repositório/host e concluir o deploy.

## Nota de validação
A checagem de build completa não foi possível neste ambiente porque as dependências do projeto (React, Firebase, Vite etc.) não estão instaladas e a instalação via npm não terminou. Revise/execute `npm install` e `npm run build` no ambiente de desenvolvimento antes de publicar.
