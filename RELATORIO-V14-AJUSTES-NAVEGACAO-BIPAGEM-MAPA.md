# Pacote É Mato — V14

Base: V13 — Adicionar/Remover Pacotes + Marcadores.

## Alterações implementadas

### Marcadores em zoom distante
- Desativado o clustering nos mapas de planejamento e navegação.
- Removidas as camadas visuais de círculos/contadores de cluster da renderização.
- As paradas individuais permanecem visíveis em zoom distante.
- Marcadores próximos usam somente deslocamento visual em pixels (`icon-offset`) dentro da camada MapLibre; as coordenadas geográficas originais não são alteradas.
- O tamanho dos marcadores reduz progressivamente quando o mapa está mais afastado.

### Bipagem de Adicionar/Remover rota
- Adicionado debounce de leitura de 2,2 s para impedir que a câmera processe o mesmo código repetidamente.
- Adicionada trava curta de processamento para impedir rajadas `bip-bip-bip` do mesmo frame/código.
- Adicionado som próprio para operações de pacotes, separado do beep da Bipagem normal.
- Adicionar e Remover usam sequências sonoras distintas.
- O modo de operação recebe identificação visual própria e não usa o feedback sonoro padrão de bipagem de parada.

### Menus de pacotes
- Removida a opção redundante `Usar rota da Bipagem` do menu de ações.
- `Adicionar à rota` e `Remover da rota` foram agrupados em `Pacotes da rota`, abrindo um seletor com as duas opções, no mesmo conceito visual do seletor de Bipagem.
- O menu de navegação também possui `Pacotes da rota` com as duas opções.

### Busca / adição rápida de endereço
- O campo de busca continua filtrando endereço/pacote.
- Ao digitar um endereço, aparece `+ Adicionar endereço`.
- Enter também abre a criação de parada com o texto digitado pré-preenchido.
- Número e complemento/apartamento podem ser informados na mesma linha e continuam usando o editor já existente.

### Painel da navegação
- O painel inferior agora possui alça para expandir/recolher no celular.
- Ao puxar para cima, mostra a lista das paradas e endereços da rota.
- A lista permite selecionar uma parada sem criar marcadores novos.

### Entregue / Não entregue / Desfazer
- O cartão mostra status `Pendente`, `Entregue` ou `Não entregue`.
- Após registrar Entregue/Não entregue, o cartão permanece na parada para permitir conferência.
- São exibidos `Desfazer status` e `Próxima pendente`.
- Desfazer restaura a parada para `pendente`, persiste a alteração e recalcula quando o serviço real estiver disponível.
- Na última parada, `Revisar paradas` fecha o resumo final e abre a lista para permitir correção antes de finalizar.

### Localização / direção
- O GPS passa a ser iniciado também quando Waze/Google Maps é a navegação preferida, para o mapa interno saber onde o motorista está.
- O botão de localização solicita uma posição atual se ainda não houver coordenada e centraliza o mapa.
- O símbolo do motorista usa heading do GPS e, quando o heading não é fornecido, estima a direção pelo deslocamento entre duas posições válidas.

### Retorno de Waze / outros aplicativos
- Adicionado tratamento de `visibilitychange`, `pageshow`, `focus` e evento interno de resume.
- Após ficar em segundo plano, o mapa de navegação é reconstruído quando necessário, redimensionado e redesenhado.
- A rota ativa é recarregada do RotaStore.
- GPS é reiniciado ao retornar.
- O fallback branco do mapa é ocultado durante a reconstrução.

### Linha da rota
- Removida a regra que quebrava a geometria visual quando havia distância superior a 1,8 km entre pontos consecutivos.
- A geometria retornada pelo serviço agora é preservada; somente coordenadas inválidas ou duplicadas consecutivas são removidas.
- A camada de progresso passou a usar verde escuro para manter a identidade visual da rota.

## Arquivos alterados
- `index.html`
- `css/roteirizacao.css`
- `css/navegacao.css`
- `css/operacoes-pacotes.css`
- `js/bipagem/operacoes-pacotes.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `js/roteirizacao/roteirizacao.js`
- `js/ui/app-shell.js`

## Testes executados no ambiente
- `node --check` em todos os arquivos JavaScript: aprovado.
- Auditoria de IDs do HTML: nenhum ID duplicado.
- Verificação estática: clustering desativado em planejamento e navegação.
- Verificação estática: marcadores configurados para continuar visíveis em zoom distante.
- Verificação estática: opção `Usar rota da Bipagem` removida dos menus.
- Verificação estática: seletores `Pacotes da rota` presentes em planejamento e navegação.
- Verificação estática: adição rápida de endereço presente.
- Teste de mutação com rota sintética de 30 paradas:
  - adição de dois pacotes selecionados: aprovado;
  - um pacote no mesmo ponto físico foi agregado sem criar parada extra: aprovado;
  - um pacote em novo endereço gerou nova parada: aprovado;
  - remoção individual do pacote adicionado: aprovado;
  - parada sem pacotes restantes foi removida: aprovado.

## Testes que ainda exigem aparelho/navegador real
- câmera física e ritmo real de leitura de código;
- percepção dos novos sons no Android/iPhone;
- retorno real do Waze/Google Maps após vários minutos em segundo plano;
- GPS/heading real durante deslocamento;
- gesto de puxar o painel em diferentes tamanhos de celular;
- visual dos marcadores em mapas reais com 30–100 paradas em diferentes zooms;
- serviço real de roteamento/geocodificação e recálculo após desfazer status.

Não foram declarados como aprovados testes que dependem dessas condições reais.
