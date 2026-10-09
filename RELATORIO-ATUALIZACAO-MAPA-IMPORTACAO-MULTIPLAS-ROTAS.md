# Pacote É Mato — atualização de mapa, importação e múltiplas rotas

Base utilizada: `Pacote-Em-Mato-ETAPA-4-REFINO-DESENHO-FLUXO-COMPLETO.zip`.

## Implementado nesta atualização

- Marcadores de paradas no mapa passaram a usar formato de balão/etiqueta com ponta.
- Paradas do mesmo **logradouro + número** exibem a multiplicidade (`2x`, `3x`, etc.). Paradas simples exibem somente o número.
- Apartamento, casa, bloco, sala, loja e complemento não alteram a chave usada para identificar múltiplos.
- No mapa/roteirização os pacotes continuam como paradas separadas. Na Bipagem, paradas com o mesmo logradouro + número são agrupadas em uma única parada física, mantendo todos os códigos dos pacotes.
- Para múltiplos no mesmo ponto foi adicionado fan-out visual dos balões sem alterar as coordenadas armazenadas da parada.
- A etapa de associação de colunas da planilha agora é sempre apresentada após a leitura, com pré-seleção automática quando o padrão é reconhecido.
- Campos destacados: AT ID, Sequence, Stop, SPX TN, Destination Address, Bairro, City, Zipcode/Postal code, Latitude e Longitude.
- Foi adicionada uma segunda seleção de quais informações da planilha devem aparecer ao chegar na parada.
- SPX TN permanece como código de pacote e agora é escrito explicitamente no PDF exportado.
- Ao importar uma nova planilha com uma rota já carregada, o usuário escolhe entre **Adicionar ao mesmo mapa** ou **Nova rota**.
- O menu de ações ganhou **Nova rota** e **Remover todas as rotas**. Remover do mapa não apaga o histórico já salvo.
- O menu de três pontos da navegação foi ampliado com as ações da rota (importar planilha, nova rota, adicionar parada, usar rota da Bipagem, validar endereços, otimizar, refinar, Bipagem, exportar PDF, Configurações, recalcular e sair).
- Depois que existe geometria calculada, os botões grandes Importar/Otimizar da base do painel são ocultados e o CTA principal passa a ser **Iniciar rota**.
- O painel Refinar, no mobile, abre sobre a tela e não exige rolar a página para baixo.
- A barra do modo desenho foi trazida para a frente no mobile, mantendo seleção por contorno, toque individual e desfazer.
- O resumo de tempo foi simplificado para duração restante e previsão de término.
- A previsão de término foi adicionada ao mapa de roteirização e ao mapa da navegação em cartões próprios, fora do banner de instrução de manobra.
- Foi adicionado atalho de Configurações no canto superior esquerdo do mapa de roteirização.
- Os controles do mapa foram reposicionados para reduzir sobreposição em telas pequenas.
- Waze e Google Maps agora priorizam esquemas nativos em Android/iOS (`waze://`, `google.navigation:`, `comgooglemaps://`) em vez de navegar o PWA para uma página web. Em desktop permanece fallback web.
- O estado da parada continua sendo persistido antes de abrir navegação externa.
- O indicador do motorista na navegação interna foi alterado para uma seta própria do Pacote É Mato e a navegação continua em 2D.
- O editor de parada ganhou um campo principal único para endereço + complemento/observação em uma linha. Os campos avançados antigos permanecem internamente para compatibilidade, mas ficam escondidos na experiência principal.
- A busca de endereço desse campo apresenta uma confirmação quando o serviço de geocodificação está disponível.

## Testes executados

1. `node --check` executado em todos os arquivos JavaScript do projeto: aprovado.
2. Validação estrutural do `index.html`: 410 IDs únicos, sem IDs duplicados.
3. Verificação de scripts e CSS locais referenciados pelo HTML: nenhum arquivo local faltando.
4. Importador testado com os dois XLSX reais fornecidos:
   - 07/10/2026: 10 paradas, 10 códigos de pacote, 10 coordenadas válidas, perfil SPX reconhecido.
   - 08/10/2026: 30 paradas, 30 códigos de pacote, 30 coordenadas válidas, perfil SPX reconhecido.
   - Cabeçalhos detectados nos dois: AT ID, Sequence, Stop, SPX TN, Destination Address, Bairro, City, Zipcode/Postal code, Latitude, Longitude.
5. Regra de Bipagem múltipla testada com exemplo sintético:
   - Rua Um, 229, Apto 33
   - Rua Um, 229, Apto 93
   - Rua Um, 229, Loja 2
   - Rua Um, 400
   Resultado: 2 paradas físicas na Bipagem; os três pacotes do número 229 foram agrupados juntos e o número 400 permaneceu separado.
6. Hash do Cloudflare Worker comparado com a base: arquivo do Worker permaneceu inalterado.

## Testes que ainda precisam de aparelho físico

Não foi declarado como aprovado o que não pôde ser executado no ambiente local:

- abertura real do Waze instalado no Android/iPhone;
- abertura real do Google Maps instalado;
- retorno pelo seletor de aplicativos recentes;
- GPS durante deslocamento real;
- voz durante navegação em campo;
- comportamento após o sistema operacional matar o PWA por falta de memória;
- avaliação visual final do fan-out dos balões com grande quantidade de paradas em um aparelho real.

Nenhum serviço externo foi publicado ou alterado nesta atualização.
