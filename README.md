# Catálogo de Referências

Aplicação React + TypeScript + Vite para consultar e administrar modelos de roupas e códigos extras. O catálogo inicial foi importado da aba **POR NOME - A Z** do arquivo Excel fornecido.

## Conteúdo inicial auditado

- **194 modelos** importados.
- **125 modelos com referência** e **69 sem código**.
- **1 caso pendente** preservado sem adivinhar atribuições: `CONJUNTO DRY G.A ADIDAS C/ FAIXAS LAT` mantém `REF.10277 / REF.10278` em conjunto.
- `BERM DRY NIKE SIMB BAS R.L` permanece com `REF.10359`.
- Os dados iniciais estão em `public/data/catalogo-inicial.json` e são empacotados na compilação, então aparecem em uma instalação nova mesmo no GitHub Pages.
- O primeiro carregamento grava o catálogo no `localStorage`. Depois disso, as edições são persistidas no navegador atual.

## Requisitos

- Node.js 20 ou mais recente
- npm

## Executar no VS Code

1. Extraia o ZIP e abra a pasta `catalogo-referencias` no VS Code.
2. Abra o terminal nessa pasta.
3. Execute:

   ```bash
   npm install
   npm run dev
   ```

4. Abra o endereço local que o Vite mostrar no terminal.
5. Para verificar a versão de produção: `npm run build`; para pré-visualizar: `npm run preview`.

## Funcionalidades

- Busca instantânea por nome ou referência, sem diferenciar acentos e maiúsculas/minúsculas.
- Ordenação numérica por referência ou alfabética por nome.
- Adicionar, editar e excluir com validação e confirmação.
- Referências repetidas em modelos diferentes são aceitas.
- Importação XLSX, XLS, CSV e JSON com prévia e opção de ignorar ou atualizar nomes equivalentes. A importação nunca remove automaticamente modelos atuais.
- Exportação XLSX e CSV, backup JSON e restauração por mesclagem.
- Tema claro/escuro e layout responsivo.

## Persistência local: importante

O modo local usa `localStorage`, que persiste após recarregar ou reabrir o navegador no mesmo perfil/dispositivo. **Não sincroniza entre computadores ou celulares.** Exporte backups JSON periodicamente. Limpar os dados do site no navegador pode apagar o catálogo local.

## Configurar Supabase (modo online)

A aplicação inclui o cliente Supabase. Para sincronização online entre dispositivos:

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`.
3. Em **Authentication > Users**, crie o usuário administrador com e-mail e senha fortes.
4. Copie o UUID desse usuário e execute no SQL Editor:

   ```sql
   insert into public.catalog_admins(user_id) values ('UUID-DO-USUARIO-AUTH');
   ```

5. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública `anon` do projeto. **Nunca use `service_role` no frontend.**
6. Reinicie `npm run dev` ou compile novamente.
7. Na interface, abra **Gerenciar dados > Conectar e carregar** e entre com a conta de administrador quando solicitado.
8. Para GitHub Pages, adicione os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em **Settings > Secrets and variables > Actions** do repositório.

A tabela `catalog_admins` determina quem pode administrar o catálogo. As políticas RLS restringem leitura e gravação da tabela `models` a usuários autenticados listados como administradores. A URL e a chave `anon` são identificadores públicos de cliente; a proteção real é feita pela autenticação e RLS. Não publique credenciais de administrador.

**Nota de sincronização:** no modo online, alterações são enviadas ao banco depois da gravação local; se o Supabase estiver indisponível ou as políticas estiverem incorretas, a interface informa que a sincronização falhou. O modo local continua sendo a cópia deste navegador. Faça backup antes de operações importantes.

## Publicar no GitHub Pages

1. Crie um repositório chamado `catalogo-referencias` (ou ajuste a base conforme abaixo).
2. Envie todos os arquivos desta pasta para a branch `main`.
3. O workflow `.github/workflows/deploy.yml` compila e publica automaticamente no GitHub Pages a cada push.
4. No GitHub, entre em **Settings > Pages** e selecione **GitHub Actions** como fonte de publicação.
5. O workflow usa a base `/catalogo-referencias/`. Se o repositório tiver outro nome, altere em `vite.config.ts` a string de `base` para `/<NOME-DO-REPOSITÓRIO>/`.
6. Para usar Supabase online, configure os secrets do Actions antes de publicar.

O site usa navegação de página única sem dependência de rotas de servidor, adequado à hospedagem estática. Para publicar sob um domínio raiz personalizado, configure `base: '/'` no `vite.config.ts` e ajuste os DNS/Pages conforme o GitHub.

## Relatório e limitações conhecidas da origem

A aba principal continha 194 modelos, dos quais 125 tinham código e 69 estavam explicitamente marcados como `SEM CÓDIGO`. Os nomes e referências foram preservados; a divergência do conjunto foi mantida como pendente. O sistema não tenta inferir a qual peça pertence cada referência. A contagem do painel é calculada dinamicamente a partir dos cadastros atuais.

## Estrutura

- `src/App.tsx`: interface e ações do catálogo.
- `src/lib/catalog.ts`: normalização, validação e ordenação.
- `src/lib/storage.ts`: carregamento inicial e armazenamento local.
- `src/lib/supabase.ts`: cliente Supabase.
- `public/data/catalogo-inicial.json`: dados reais importados da planilha.
- `supabase/schema.sql`: esquema, autenticação administrativa e políticas RLS.
- `.github/workflows/deploy.yml`: build e deploy do GitHub Pages.
