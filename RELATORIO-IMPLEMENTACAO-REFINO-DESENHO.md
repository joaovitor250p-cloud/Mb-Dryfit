# Relatório — Refinamento por desenho, fluxo de entrega e persistência

Data da revisão: 09/10/2026

## Escopo desta entrega

A alteração foi feita sobre o ZIP atual do Pacote É Mato, preservando a estrutura do projeto. Nenhum deploy em produção foi realizado e nenhum serviço externo foi alterado.

### 1. Refinar rota

O painel de refinamento foi alterado para conter:

- Otimizar automaticamente.
- Inverter ordem das paradas pendentes.
- Desenhar no mapa.
- Desfazer última alteração.

A ferramenta de desenho é funcional. O motorista pode:

- desenhar um polígono livre ao redor de várias paradas;
- tocar individualmente em marcadores para adicionar/remover uma parada da seleção;
- alternar temporariamente para modo de movimentação do mapa;
- limpar a seleção;
- colocar o grupo selecionado antes das demais paradas pendentes;
- colocar o grupo no fim das paradas pendentes;
- definir uma única parada selecionada como a próxima;
- desfazer a última alteração de ordem.

A seleção usa as coordenadas reais projetadas pelo mapa. Marcadores concluídos ou não entregues não entram na seleção de reorganização. A alteração de ordem trabalha com IDs permanentes, não com o número visual do marcador.

Depois de uma alteração manual, o percurso é recalculado pelo serviço de rota existente. Se o recálculo falhar, a ordem e o histórico de refinamento anteriores são restaurados.

### 2. Informações da parada

A exibição voltou a preservar informações operacionais como:

- complemento;
- apartamento;
- bloco;
- sala;
- loja;
- observação.

O texto original de `Destination Address` também continua preservado integralmente. Assim, detalhes que já vêm embutidos no endereço não são descartados.

### 3. Entregue / Não entregue / Navegar

O cartão da navegação usa:

`Navegar | Não entregue | Entregue`

- Não entregue agora funciona com um toque e não exige motivo.
- Entregue continua registrando o horário e avançando para a próxima pendente.
- Os dois botões de seta do cartão foram removidos.
- O gesto horizontal continua disponível apenas para consultar outra parada e não altera o resultado da entrega.
- Antes de abrir navegação externa, a nota atualmente digitada é copiada para a parada e persistida.

O botão Navegar lê a preferência salva em Configurações:

- Pacote É Mato: navegação interna.
- Waze: abre diretamente o destino no Waze.
- Google Maps: abre diretamente o destino no Google Maps.

Não existe um seletor adicional ao tocar em Navegar.

### 4. Retorno do segundo plano

Foi centralizada a persistência operacional para evitar que uma retomada seja tratada como nova inicialização.

São preservados, na medida suportada pelo navegador/PWA:

- módulo atual;
- estado do painel inferior;
- parada selecionada;
- próxima parada;
- rota ativa;
- resultados já registrados;
- nota de entrega;
- preferência de navegação;
- busca da lista;
- estado relevante da navegação.

Eventos de `visibilitychange`, `pageshow` e `focus` não recarregam a página nem reinicializam a rota. O retorno dispara uma retomada da navegação, com proteção contra execução duplicada em sequência.

A Rota Ativa permanece no armazenamento existente. O `rota-store` também mantém uma cópia local de contingência da rota ativa para recuperação se o processo for recriado e o armazenamento IndexedDB não estiver imediatamente disponível.

### 5. Marcadores durante a navegação

A navegação mantém uma camada com todas as paradas numeradas. A numeração permanece visível para:

- pendentes;
- parada atual;
- entregues;
- não entregues.

Os estados usam aparências diferentes, mas o número continua representando a posição atual na sequência. O ID permanente da parada continua separado dessa numeração.

### 6. Bipagem e menu

O menu lateral foi simplificado. Foram retirados dele os acessos operacionais duplicados de Início, Roteirização e Bipagem e a antiga opção de zerar bipagens.

O menu `⋮` da Roteirização contém Bipagem. Ao abrir:

- Bipar rota atual: usa a mesma rota ativa e códigos de pacote.
- Importar PDF: abre o fluxo legado de PDF para sistema compatível.

Termos de uso, Política de privacidade e Licenças foram agrupados em Configurações > Legal.

### 7. Histórico reutilizável

A tela de Histórico ganhou ação para abrir uma rota existente no mapa. A rota não é duplicada. Quando outra rota já está ativa, há confirmação antes de trocar qual rota será aberta; a rota anterior continua salva no Histórico.

## Testes automatizados executados

Os testes abaixo foram executados contra os arquivos desta entrega em ambiente Node/VM.

### Refinamento de ordem

Resultado:

```text
invert E,B,C,D,A
draw-start C,B,A,D,E
undo E,B,C,D,A
draw-end E,B,A,D,C
draw-single-next A,B,E,D,C
rollback E,B,A,D,C
PASS routing refine tests
```

Validou:

- inversão apenas das posições pendentes;
- entregues e não entregues preservados;
- grupo desenhado para o início;
- grupo enviado ao fim;
- uma parada definida como próxima;
- desfazer;
- rollback quando o recálculo de rota falha.

### Lasso e seleção individual

Resultado:

```text
lasso A,B
tap-add A,B,C
tap-remove A,C
PASS lasso + individual selection tests
```

Uma parada já entregue dentro da área desenhada foi corretamente ignorada pela seleção de reorganização.

### Navegação externa e entrega

Resultado resumido:

```text
Waze: URL de destino gerada
ordem de operação: save > session > open
Google Maps: URL de directions gerada
PASS navigation flow tests
```

O teste também confirmou:

- nota digitada salva antes de abrir outro aplicativo;
- parada selecionada recuperada;
- Não entregue sem motivo obrigatório;
- avanço para próxima pendente;
- detalhe de loja preservado no cartão.

### Importação dos XLSX reais

Foram usados os dois XLSX fornecidos nesta conversa.

```text
07-10-2026: perfil=spx, paradas=10, coordenadas=10, códigos=10, erros=0
08-10-2026: perfil=spx, paradas=30, coordenadas=30, códigos=30, erros=0
PASS real XLSX import tests
```

O teste utilizou o parser XLSX nativo do próprio projeto.

### Recuperação da rota ativa

Foi simulado um novo contexto JavaScript sem IndexedDB disponível, mantendo apenas a contingência local da rota ativa.

Foram recuperados:

- ID da rota;
- parada selecionada;
- próxima parada;
- status entregue;
- nota salva.

Resultado: `PASS route store fallback recovery`.

### Recuperação da sessão operacional

Novo contexto restaurou:

- módulo Navegação;
- painel intermediário;
- busca;
- parada selecionada;
- próxima parada;
- preferência Waze;
- navegação ativa.

O retorno ao primeiro plano disparou evento de retomada e não uma inicialização completa.

Resultado: `PASS operational session restore/resume`.

### Histórico

Uma rota histórica existente foi ativada e aberta na Roteirização sem criar cópia.

Resultado: `PASS history reopen test`.

### Marcadores numerados

A fonte de marcadores de navegação continha simultaneamente paradas entregue, pendente e não entregue, todas com sua numeração.

Resultado: `PASS navigation numbered markers test`.

### Auditoria estática

- todos os arquivos JavaScript em `js/` passam em `node --check`;
- os IDs do `index.html` são únicos;
- referências locais de scripts, CSS e imagens usadas pelo `index.html` existem;
- os botões antigos de seta da navegação não estão presentes no HTML;
- o botão direto de inversão fora do painel Refinar não está presente;
- o código do Cloudflare Worker e sua configuração não foram alterados nesta rodada.

## Testes que NÃO foram declarados como executados

O ambiente de desenvolvimento bloqueou a abertura do aplicativo local em Chromium/headless. Portanto não foi declarado como aprovado um teste visual completo em navegador real.

Também dependem de teste em celular físico/publicação de teste:

- handoff real para o aplicativo Waze e retorno pelo seletor de apps;
- handoff real para o aplicativo Google Maps e retorno;
- comportamento após o Android encerrar o processo em segundo plano;
- GPS em deslocamento real;
- voz/TTS em deslocamento;
- sensação dos gestos de desenho, swipe e painel em hardware real;
- funcionamento com tela bloqueada, que depende das limitações do navegador/PWA.

O código foi preparado para esses fluxos, mas eles não foram apresentados como testes físicos concluídos.

## Serviços externos e credenciais

- Nenhum deploy foi executado.
- Nenhuma configuração de produção foi alterada.
- Nenhuma chave secreta foi adicionada ao frontend.
- O Worker de rotas existente permanece como dependência para geocodificação, otimização e percurso real pelas ruas.

## Passo manual recomendado

Publicar esta versão somente em um ambiente de teste ou branch de homologação e executar no Android, nesta ordem:

1. importar o XLSX de 30 paradas;
2. otimizar;
3. testar Inverter;
4. desenhar um grupo e depois selecionar uma parada individualmente;
5. desfazer;
6. iniciar a rota;
7. abrir Waze e retornar;
8. registrar Não entregue em um toque;
9. abrir Google Maps e retornar;
10. enviar o PWA para segundo plano e recuperar;
11. reabrir uma rota pelo Histórico.

Essa validação física é a etapa restante que o ambiente atual não consegue reproduzir com fidelidade.
