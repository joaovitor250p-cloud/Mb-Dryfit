# Painel do Dono separado — implantação segura

## O que a V53 separa
- O atalho antigo de 5 toques do Modo Dono foi desativado no app do motorista.
- O painel novo fica em `/admin/`.
- O navegador do administrador não recebe a senha mestre do Worker antigo.
- Um Cloudflare Worker novo (`admin-gateway-worker.js`) valida **e-mail + PIN**, emite sessão assinada de curta duração e encaminha apenas rotas administrativas permitidas.

## 1. Publicar o site
Publique a pasta normalmente. O painel ficará em `.../admin/`.

## 2. Configurar o gateway
Edite `cloudflare/wrangler-admin.toml` e defina `ADMIN_ORIGIN` com a origem EXATA do painel. Exemplos:
- `https://joaovitor250p-cloud.github.io` se o painel estiver nesse mesmo origin; ou
- `https://admin.pacoteemato.com.br` quando usar domínio próprio.

## 3. Criar os segredos no Cloudflare
Na pasta `cloudflare`:
```bash
npx wrangler secret put OWNER_EMAIL --config wrangler-admin.toml
npx wrangler secret put OWNER_PIN --config wrangler-admin.toml
npx wrangler secret put SESSION_SECRET --config wrangler-admin.toml
npx wrangler secret put UPSTREAM_ADMIN_PASSWORD --config wrangler-admin.toml
npx wrangler secret put GATEWAY_SHARED_SECRET --config wrangler-admin.toml
```
Use PIN com pelo menos 6 dígitos e uma `SESSION_SECRET` longa e aleatória (32+ bytes). `UPSTREAM_ADMIN_PASSWORD` é a senha que hoje abre `/admin/login` no Worker antigo.

## 4. Publicar o gateway
```bash
npx wrangler deploy --config wrangler-admin.toml
```

## 5. Apontar o painel para o gateway
Em `admin/config.js`:
```js
window.PEMATO_ADMIN_GATEWAY_URL = 'https://pacote-emato-admin-gateway.SEU-SUBDOMINIO.workers.dev';
```
Não coloque e-mail, PIN, senha mestre ou qualquer segredo nesse arquivo.

## Proteção adicional recomendada no Worker antigo
O código-fonte do Worker `holy-frog-272c...` não está neste pacote. Por isso a V53 não consegue bloquear diretamente o acesso externo às rotas `/admin/*` dele. Para fechar completamente a arquitetura, altere esse Worker para exigir `X-Pemato-Admin-Gateway` com o mesmo `GATEWAY_SHARED_SECRET` em TODAS as rotas administrativas (exceto, se necessário durante migração, um login temporário). Depois remova o acesso administrativo direto.

## Cloudflare recomendado
- Ative WAF / Managed Rules.
- Crie Rate Limiting para `/session/login` e `/api/admin/*`.
- Use domínio próprio com HTTPS.
- Quando `admin.pacoteemato.com.br` estiver disponível, considere Cloudflare Access como uma camada extra.
- Não reutilize o PIN em outros serviços.
