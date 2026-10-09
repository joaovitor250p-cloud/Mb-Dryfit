# Pacote É Mato — atualização incremental da Etapa 4

## Base
Pacote-Em-Mato-ETAPA-4-SPX-OTIMIZACAO-NAVEGACAO-REFINADA.zip. Projeto existente preservado; nenhum deploy executado.

## Mudanças implementadas
- `js/navegacao/navegacao.js`: camada GeoJSON para **todas** as paradas com numeração persistente durante a navegação, cores para pendente/entregue/não entregue, sem duplicar o marcador da próxima parada; cartões anterior/próxima por toque e swipe, parada selecionada por ID, salvamento de seleção antes de abrir Waze/Google Maps, nota da entrega persistida, validação de motivo no ato de confirmar não entrega, retomada de GPS/mapa ao retornar à aba quando permitido.
- `index.html` e `css/navegacao.css`: três botões Navegar/Não entregue/Entregue, número da parada antes do endereço e controles anterior/próxima.
- `js/ui/app-shell.js`: guarda a seção atual no armazenamento local/de sessão, não reinicia módulo quando selecionado novamente, evita reinicialização em focus/visibilitychange e recupera seção em nova abertura quando o login existente permitir.
- `js/roteirizacao/roteirizacao.js` e `css/roteirizacao.css`: painel inferior em três alturas, preferência de altura em sessionStorage, inversão de ordem com restauração caso cálculo rodoviário falhe.
- `README.md`: documentação de retomada.

## Preservação
`js/app.js`, Firebase, login, importador XLSX SPX, PDF, bipagem, Worker e credenciais não foram alterados. A rota continua usando o RotaStore/IndexedDB existente. Nenhum serviço foi publicado.

## Verificações executadas
- `node --check` em todos os arquivos JS do projeto: aprovado.
- Integridade e referências de arquivos locais do ZIP: verificar no empacotamento.
- Tentativa de teste Chromium via HTTP local: **não executável** neste ambiente, bloqueio `ERR_BLOCKED_BY_ADMINISTRATOR` ao abrir localhost. Não há aprovação de teste visual nem de integração real com Geoapify.

## Pendências não implementadas / limites
- Desenhar polígonos para reorganização de grupos no mapa e desfazer operações **não foi implementado**; exige fluxo cartográfico e recálculo rodoviário integrado com testes.
- Não há garantia de continuidade de GPS/voz com tela bloqueada; depende de Android/PWA.
- Restauração após encerramento do processo depende da sessão Firebase e armazenamento mantidos; precisa de teste físico Android.
- Não foi possível confirmar funcionamento em campo de Waze/Google Maps nem geocodificação/otimização online.
- Imagem “519” e a segunda imagem não foram identificadas inequivocamente no projeto; não foram alteradas.

## Publicação
Extraia o ZIP, publique o conteúdo da pasta `Pacote-Em-Mato/` no mesmo repositório, preservando os subdiretórios. O ZIP não deve ser enviado como único arquivo ao GitHub Pages. Nenhuma configuração de Worker/Firebase foi alterada.
