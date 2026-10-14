# Pacote É Mato — V31 — Postos de combustível próximos

## Objetivo
Adicionar uma camada opcional de postos de combustível próximos ao motorista sem interferir na rota ativa, na numeração das entregas ou na otimização.

## Implementação

### Novo módulo `js/mapa/postos.js`
- Obtém a localização atual pelo módulo já existente `PacoteEMatoLocalizacaoAtual`.
- Só consulta a internet quando o usuário ativa o botão de postos.
- Busca `amenity=fuel` em um raio de 5 km usando Overpass/OpenStreetMap.
- Possui dois endpoints públicos de consulta com fallback sequencial.
- Timeout por consulta e cache local em memória de 8 minutos.
- Nova consulta só é necessária quando o motorista se afasta aproximadamente 1,8 km do centro do cache.
- Ordena por distância e limita a 30 postos mais próximos.
- Não altera coordenadas, paradas, roteirização ou persistência da rota.

### Identificação das bandeiras
A bandeira é identificada somente quando os dados públicos do posto informam `brand`, `operator` ou um nome reconhecível. Foram criados símbolos visuais para:
- Shell
- Ipiranga
- BR / Petrobras / Vibra
- ALE
- Esso
- Texaco
- posto genérico quando a bandeira não estiver cadastrada

Nenhuma bandeira é inventada quando o dado não existe.

### Interface
Foi adicionado um botão de posto nos dois mapas:
- `routingFuelBtn` — planejamento/roteirização
- `navFuelBtn` — navegação

Ao ativar:
1. o app obtém a posição atual;
2. consulta os postos próximos;
3. mostra os postos em uma camada própria do MapLibre;
4. centraliza suavemente a região do motorista;
5. tocar no ícone abre um card com nome, bandeira, distância e endereço;
6. o card oferece atalhos para Waze e Google Maps.

Tocar novamente no botão oculta os postos e restaura a visualização anterior do mapa.

## Arquivos alterados
- `index.html`
- `js/mapa/mapa.js`
- `js/navegacao/navegacao.js`
- `README.md`

## Arquivos adicionados
- `js/mapa/postos.js`
- `css/postos.css`
- `RELATORIO-V31-POSTOS-PROXIMOS.md`

## Testes executados
- `node --check` em todos os JavaScripts: aprovado.
- Auditoria de IDs duplicados no HTML: nenhum ID duplicado.
- Confirmação dos dois botões e carregamento do novo módulo/CSS: aprovado.
- Teste isolado do reconhecimento de bandeiras: Shell, Ipiranga, BR/Petrobras e genérico aprovados.
- Teste do parser de um posto com coordenadas/endereço e cálculo de distância: aprovado.
- Integridade do ZIP: verificada após empacotamento.

## Validação manual pendente
Os seguintes pontos dependem de rede/GPS/aparelho real e não foram declarados como aprovados:
- disponibilidade real dos servidores públicos Overpass na rede móvel do aparelho;
- permissão e precisão do GPS;
- quantidade/qualidade de bandeiras cadastradas no OpenStreetMap em cada região;
- aparência final dos ícones em diferentes densidades de tela;
- abertura real de Waze/Google Maps no Android/PWA.
