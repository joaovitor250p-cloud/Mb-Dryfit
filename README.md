# Pacote É Mato

Aplicativo web/PWA de logística com Roteirização, Navegação, Bipagem e Histórico compartilhando uma única Rota Ativa.

## Fluxo principal desta versão

```text
Importar XLSX
    ↓
Processamento com logo do Pacote É Mato
    ↓
Conferência das paradas
    ↓
Corrigir/adicionar endereços se necessário
    ↓
Confirmar
    ↓
Mapa e planejamento
    ↓
Geocodificação / otimização / rota pelas ruas (quando Worker estiver configurado)
    ↓
Navegação própria / Waze / Google Maps
    ↓
Entregue ou Não entregue
    ↓
Histórico
```

A Rota Ativa anterior não é substituída apenas por selecionar um arquivo. A nova rota só é salva depois da conferência.

## Importação

- XLSX e CSV continuam suportados; XLS antigo depende do SheetJS carregado pela aplicação.
- Cabeçalho pode estar depois de linhas introdutórias.
- Colunas desconhecidas podem ser associadas manualmente.
- Pacotes, observações, complemento, cidade e UF são preservados.
- Latitude/longitude são opcionais. Se existirem e forem válidas, a parada já pode aparecer no mapa sem nova geocodificação.
- Coordenadas ausentes ou inválidas nunca viram `(0,0)`.

## Serviço seguro de rotas

O Worker já previsto no projeto fornece:

```text
GET  /health
POST /geocode
POST /optimize
POST /route
```

A chave `GEOAPIFY_API_KEY` deve permanecer apenas no ambiente do Cloudflare Worker.

Sem Worker configurado, importação, conferência, edição, persistência local, mapa-base e Bipagem continuam disponíveis, mas o sistema não inventa geocodificação ou otimização.

### Configuração futura

```bash
cd cloudflare
npx wrangler login
npx wrangler secret put GEOAPIFY_API_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Depois cole a URL publicada em **Configurações → Serviço de rotas** e use **Testar conexão**.

## Preservação do núcleo

Esta atualização não reescreve o núcleo legado de login/Firebase, PDF, agrupamento físico, câmera, scanner e Bipagem. O Worker também não foi alterado.

Consulte `RELATORIO-FLUXO-IMPORTACAO-ENTREGA.md` para detalhes, testes e limitações.
