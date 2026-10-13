# Pacote É Mato — V27 — status visual da rota

## Objetivo
Adicionar feedback visual persistente para Entregue e Não entregue no mapa, inspirado no comportamento de apps de roteirização, sem alterar coordenadas nem criar marcadores duplicados.

## Implementação
- Marcador entregue: verde escuro, texto branco e símbolo ✓.
- Marcador não entregue: vermelho, texto branco e símbolo ×.
- Parada pendente: mantém o padrão branco/verde.
- Selecionar uma parada finalizada preserva sua cor de status.
- Trecho até parada entregue: verde escuro.
- Trecho até parada não entregue: vermelho.
- A linha futura continua verde padrão.
- A rota base usada para o histórico visual é persistida em `visualStatusBase`, evitando que o recálculo após cada entrega apague o caminho já tratado.
- Desfazer entrega/não entrega atualiza marcador e linha novamente para Pendente.

## Arquivos alterados
- `js/mapa/marcadores.js`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `js/roteirizacao/roteirizacao.js`
- `js/core/rota-store.js`
- `js/state.js`
- `index.html`
- `README.md`

## Testes executados
- `node --check` em todos os JavaScripts.
- Teste sintético com rota contendo parada entregue e não entregue: dois segmentos de status gerados corretamente.
- Teste de nomes de ícones: parada selecionada entregue e selecionada não entregue usam assets distintos.
- Verificação de cache V27 no `index.html`.
- Verificação de integridade do ZIP.

## Validação manual pendente
- Aparência em aparelho Android/iOS durante navegação real.
- Cor dos trechos após vários recálculos por GPS.
- Comportamento com várias paradas no mesmo endereço físico.
