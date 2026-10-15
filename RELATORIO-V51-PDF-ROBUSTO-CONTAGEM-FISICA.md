# V51 — PDF robusto, contagem física e refinamento corrigido

- Adicionada leitura direta das linhas visuais do PDF.js para Spoke/Circuit, sem depender da coluna `#`.
- Códigos BR são associados ao endereço da mesma linha visual antes dos leitores de contingência.
- Corrigido bug do Refinar que podia abrir apenas o fundo desfocado com o painel interno oculto.
- Removido o card `Abrir Bipagem` da tela principal da rota; Bipagem continua no menu lateral.
- Contagem de paradas na roteirização/revisão passa a usar endereços físicos únicos; entregas permanecem informadas separadamente.
- Todos os assets locais do `index.html` receberam cache-bust V51 para evitar JavaScript antigo no celular.
