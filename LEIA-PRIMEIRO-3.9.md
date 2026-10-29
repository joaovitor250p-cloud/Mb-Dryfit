# MB REFERENCIAS 3.9 — Novo modelo com foto + filtro por tipo

Esta versão parte integralmente da 3.8 e mantém Catálogo de Modelos, Amostras, Cortes, a importação das 21 OCs, as 175 associações de fotos, Firebase e o workflow GitHub Actions. Nenhuma alteração de regras do Firestore é necessária para os filtros.

## Mudanças

1. **Novo modelo:** ao clicar, aparecem nome, REF e **foto opcional do computador** com prévia. A imagem é compactada por `optimizePhoto` (limite de 90 mil caracteres) e gravada em `models/{id}.imageData` junto do novo modelo. É possível adicionar sem foto e editar posteriormente. Não são criados registros extras por cor ou tamanho.
2. **Sem contadores por foto:** removidos os cartões **Com foto** e **Sem foto**. A listagem mostra uma indicação discreta de quantos modelos estão sendo exibidos.
3. **Filtro de tipos:** um menu de seleção no Catálogo e outro em Amostras com `Todos`, `Bermudas (BERM)`, `Camisas (CAM)`, `Camisetas`, `Regatas`, `Conjuntos`, `Calças`, `Jaquetas`, `Outros`.
4. **Sem alteração de dados:** a categoria é identificada pelo começo do nome, sem gravar ou reescrever o nome, a REF, tamanho ou cor. Os filtros são locais à interface e coexistem com a pesquisa.
5. **Cortes inalterados:** continuam somente **Em andamento** e **Prontos**; ao marcar Pronto, a OC deixa de aparecer em Amostras. Os 175 links de fotos iniciais ficam preservados.

## Como publicar sem Node.js no seu computador

1. Faça **Backup / Exportar** do catálogo e o backup das OCs antes de substituir arquivos.
2. Extraia este ZIP no Windows, abra o repositório `joaovitor250p-cloud/Mb-Dryfit` no GitHub e atualize os arquivos internos, preservando as pastas `src/` e `.github/`.
3. Faça commit na branch `main`. O workflow `.github/workflows/deploy.yml` continua responsável pelo `npm install` e `npm run build` na nuvem.
4. Confirme a compilação verde em **Actions** e atualize seu site com Ctrl+Shift+R.
5. Teste um **Novo modelo** fictício com foto e depois exclua somente esse modelo de teste. Teste também `BERM` no Catálogo e em Amostras, sem alterar nenhuma OC real.

**Segurança:** não reimporte seus 194 modelos. O upload da foto só é realizado por usuário com perfil administrador/editor e depende das regras Firestore já vigentes. Se um documento exceder os limites do Firebase, o site exibirá um erro e não deverá criar um modelo parcial (o cadastro é um batch com auditoria).

## Testes

- Parser TypeScript/TSX: todos os 14 arquivos TS/TSX da pasta `src` sem erros de sintaxe.
- Classificador: `tsc --strict` isolado passou e foram classificados os 194 nomes originais: camisas 93, bermudas 56, conjuntos 24, regatas 12, camisetas 4, jaquetas 3, calças 2.
- Build integral (`npm run build`) **não foi executado**: o `npm install` não concluiu em 30 s devido à indisponibilidade do registro npm neste ambiente. A execução real deve ser conferida no GitHub Actions.
- Firebase ao vivo: **não testado**; nenhum documento remoto foi alterado.
