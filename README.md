# Pacote É Mato

Aplicativo web/PWA de logística com Roteirização, Navegação, Bipagem e Histórico compartilhando uma única Rota Ativa.

## Fluxo operacional

```text
Importar XLSX
    ↓
Processamento com a logo do Pacote É Mato
    ↓
Conferência das paradas e dos códigos de pacote
    ↓
Coordenadas do XLSX são aproveitadas quando válidas
    ↓
Mapa e planejamento
    ↓
Otimizar rota pela rede viária
    ↓
Revisar sequência, distância e tempo
    ↓
Confirmar rota
    ↓
Navegação própria / Bipagem / Waze / Google Maps
    ↓
Entregue ou Não entregue
    ↓
Histórico
```

A Rota Ativa anterior não é substituída apenas por selecionar um arquivo. A nova rota somente se torna ativa depois da tela de conferência.

## Planilhas SPX

Esta versão reconhece automaticamente o formato operacional usado nos arquivos reais fornecidos para teste:

```text
AT ID
Sequence
Stop
SPX TN
Destination Address
Bairro
City
Zipcode/Postal code
Latitude
Longitude
```

Regras:

- `SPX TN` é preservado como código do pacote/bipagem.
- `Destination Address` é mantido como endereço de origem sem destruir complementos.
- Bairro, cidade e CEP permanecem separados.
- Latitude/Longitude válidas do próprio XLSX são utilizadas diretamente no mapa.
- O número do imóvel também é identificado quando está embutido em `Destination Address`.
- `Sequence` e `Stop` são preservados como dados de origem; a ordem operacional é a ordem retornada pelo otimizador.
- Coordenadas ausentes, incompletas ou inválidas nunca viram `(0,0)`.
- Arquivos de formato diferente continuam podendo usar o mapeamento manual de colunas.

## Otimização e revisão

O padrão para entregas urbanas agora é **Menor distância (`short`)**. Depois do cálculo, o motorista recebe uma tela de conferência com:

- ponto de partida;
- sequência numerada;
- distância;
- tempo dirigindo;
- tempo de atendimento;
- tempo total;
- previsão de término;
- opção **Refinar** entre Menor distância, Equilibrada e Menos manobras quando compatível;
- botão **Confirmar rota**.

A ordem não é calculada por distância em linha reta. O frontend utiliza o Worker seguro para `/optimize` e, depois, `/route` para obter o percurso rodoviário.

## Navegação

A navegação própria permanece separada da Bipagem e trabalha com a mesma Rota Ativa.

- mapa 2D, `pitch = 0` e remoção de camadas `fill-extrusion`;
- posição GPS separada das coordenadas das paradas;
- instruções derivadas da geometria/steps da rota;
- orientação por voz quando o navegador oferece suporte;
- Entregue / Não entregue avançam para a próxima parada pendente;
- motivo e observação de Não entregue são opcionais;
- ações secundárias ficam recolhidas no menu da navegação;
- Waze e Google Maps permanecem disponíveis.

A execução em segundo plano de GPS/voz continua sujeita às limitações do navegador/PWA.

## Bipagem

Depois da otimização, **Abrir Bipagem** está disponível no menu de ações da Roteirização. O aplicativo salva a mesma Rota Ativa e abre a Bipagem usando a ponte já existente, sem exportar/reimportar PDF.

## Configurações

Veículo, navegação preferida, tempo médio de parada, retorno ao início, ponto inicial e URL do Worker utilizam salvamento automático. O botão antigo de salvar foi mantido apenas como compatibilidade e fica oculto.

## Serviço seguro de rotas

Worker atual:

```text
https://pacote-emato-rotas.joaovitor250p.workers.dev
```

Endpoints previstos e implementados:

```text
GET  /health
POST /geocode
POST /optimize
POST /route
```

O `/health` pode ser aberto diretamente para diagnóstico. As rotas operacionais continuam protegidas por `ALLOWED_ORIGINS`.

A chave `GEOAPIFY_API_KEY` deve permanecer somente como Secret no Cloudflare. Nunca coloque a chave no HTML, JavaScript público ou repositório.

O código-fonte do Worker separado fica em `cloudflare/geocodificacao-worker.js`; o `wrangler.toml` usa o nome `pacote-emato-rotas` para permanecer alinhado ao Worker que foi criado no Cloudflare.

## Publicação do Worker, se for necessário repetir no futuro

```bash
cd cloudflare
npx wrangler login
npx wrangler secret put GEOAPIFY_API_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

A origem autorizada atual é:

```text
https://joaovitor250p-cloud.github.io
```

## Preservação do núcleo

A evolução continua separada do núcleo legado. Login/Firebase, PDF, agrupamento físico do PDF, scanner, câmera, Bipagem e integrações antigas continuam nos módulos existentes.

Consulte `RELATORIO-SPX-OTIMIZACAO-NAVEGACAO.md` para as alterações e testes desta entrega.


## Recuperação de sessão e navegação (atualização)
O aplicativo registra a última seção em sessionStorage/localStorage e a rota ativa no armazenamento já existente. O retorno por `pageshow`/`visibilitychange` não refaz o login nem reimporta a rota. Quando o sistema operacional mata o processo, a restauração depende de o navegador manter o armazenamento e de o login ainda ser válido. GPS e voz não são garantidos em segundo plano.
