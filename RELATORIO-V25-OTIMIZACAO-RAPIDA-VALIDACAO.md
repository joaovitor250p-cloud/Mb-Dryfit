# Pacote É Mato — V25 — Otimização rápida da validação de posições

## Problema identificado

A etapa "Conferindo posições da planilha" estava validando todas as coordenadas XLSX antes de calcular a rota. Em uma rota com 101 paradas, isso significava até 101 consultas de geocodificação antes do motorista conseguir continuar. Além disso, a implementação fazia o processamento de forma essencialmente sequencial e respeitava um intervalo padrão de 400 ms entre inícios de requisição.

Esse comportamento priorizava auditoria máxima, mas era inadequado para uso em rua.

## Mudança de estratégia

A V25 separa duas necessidades:

1. **Otimizar rápido** — antes da otimização, o app faz uma checagem rápida e genérica das coordenadas mais suspeitas e de uma amostra distribuída por toda a planilha.
2. **Auditoria completa** — continua disponível pela ação **"Validar endereços e posições"** no menu, para quando o motorista quiser conferir todas as coordenadas do XLSX.

Nenhum endereço específico, cidade específica ou planilha específica foi codificado.

## Checagem rápida

Para rotas grandes, são priorizados no máximo 14 pontos por otimização.

A seleção prioriza automaticamente:

- coordenadas exatamente repetidas em endereços diferentes;
- pontos muito afastados do centro robusto da rota;
- outliers dentro do mesmo CEP;
- outliers dentro do mesmo bairro;
- e completa as vagas com uma amostra distribuída do início ao fim da planilha.

Assim, uma rota com 101 paradas não precisa mais esperar 101 consultas antes de iniciar o cálculo.

## Paralelismo controlado

A validação rápida usa até 4 tarefas concorrentes, com início de requisições espaçado para evitar rajadas excessivas no serviço.

A geocodificação de paradas que realmente estão sem coordenadas também passou a usar um pool controlado de até 3 tarefas, em vez de aguardar cada endereço terminar antes de iniciar o próximo.

Foi adicionada uma fila de início de requisições para que o controle de intervalo continue correto mesmo quando há concorrência.

## Auditoria completa

A opção de menu anteriormente chamada "Validar endereços" agora aparece como:

**Validar endereços e posições**

Ela continua fazendo a validação completa, incluindo:

- localizar paradas sem coordenadas;
- conferir as coordenadas provenientes do XLSX com o endereço;
- corrigir pontos deslocados quando a confirmação do endereço for confiável.

Portanto, a correção continua genérica para qualquer XLSX; apenas deixou de bloquear a otimização com uma varredura completa de 100+ pontos.

## Feedback de progresso

Durante a checagem rápida, o overlay passa a mostrar progresso como:

`Conferindo 6/14 ponto(s) antes de calcular a rota.`

Na auditoria manual, o status também mostra o andamento das localizações e conferências.

## Testes executados

- `node --check` em todos os arquivos JavaScript: aprovado.
- Simulação com 101 paradas XLSX: a seleção rápida ficou limitada a 14 pontos.
- Na simulação, uma coordenada duplicada em endereço diferente foi automaticamente priorizada.
- A amostra rápida incluiu pontos distribuídos do começo ao fim da lista, incluindo a região central da rota.
- Teste com serviço simulado: 14 validações, concorrência 4 e espaçamento de requisição configurado concluíram em aproximadamente 2,8 s com latência simulada de 30 ms por resposta.
- Cache-busting atualizado para `v25`.

## Validação ainda necessária no aparelho

O tempo real depende da rede móvel, latência do Worker e resposta do provedor de geocodificação. O ganho precisa ser medido em uma rota real de 100+ paradas no celular.
