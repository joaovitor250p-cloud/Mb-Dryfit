# MB REFERENCIAS 4.12 — Leia primeiro

## O que mudou

1. **Fotos das amostras:** a primeira imagem continua sendo a foto principal; a segunda e a terceira ficam na galeria da mesma OC, na ordem em que foram adicionadas. A remoção da principal promove a próxima foto automaticamente.
2. **Orientação das fotos:** o processamento agora lê a orientação EXIF de JPEG e aplica a rotação/espelhamento antes de compactar. A mesma rotina é usada pelo Catálogo, Amostras e Notas Fiscais.
3. **Retomar navegação:** pesquisa, filtros e posição de rolagem são guardados por usuário e por área no armazenamento da sessão do navegador. Ao voltar para uma área, o sistema recupera o estado anterior sem gravar isso no Firestore.
4. **Amostras responsivas:** cartões em duas colunas em celulares, tablets e notebooks compactos; telas maiores usam mais colunas conforme o espaço disponível.

## Publicação

1. Faça uma cópia do projeto que está publicado.
2. Substitua os arquivos pelo conteúdo deste pacote.
3. Execute `npm install`.
4. Execute `npm run build` e confirme que terminou sem erros.
5. Publique o conteúdo pelo fluxo habitual do GitHub Pages.

## Firebase e dados

- Esta versão não altera a estrutura do Firestore nem exige novas regras. Mantenha as regras 4.11.1 que já foram publicadas e testadas no seu projeto.
- Nenhuma coleção, OC, modelo, nota fiscal ou imagem existente é apagada ou migrada por esta atualização.
- A memória de pesquisa/filtros/rolagem fica somente na sessão do navegador e é separada por usuário e por área.

## Teste rápido depois de publicar

- Tire três fotos de uma amostra: a primeira deve aparecer como **PRINCIPAL**, as outras como **FOTO 2** e **FOTO 3**.
- Feche e abra a amostra: confirme a mesma ordem.
- Tire uma foto em pé e outra na horizontal; ambas devem ser exibidas na orientação correta.
- Pesquise uma OC, role a lista, abra outra área e volte: pesquisa, filtro e posição devem continuar iguais.
- Repita no celular e no notebook para conferir a grade responsiva.
