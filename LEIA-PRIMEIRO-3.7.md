# MB REFERENCIAS 3.7 — INSTALAÇÃO

## O que mudou

1. Corrigido `src/BackupExport.tsx`: dados do Firestore recebem uma tipagem compatível com os campos `name`, `reference`, `oc`, `status`, `email` etc. Resolve os erros `TS2339` exibidos no GitHub Actions.
2. `Cortes` mostra só as categorias **Em andamento** e **Prontos**. Botão **Chegou na loja** removido.
3. OCs antigas com estado interno `store` continuam visíveis em **Prontos**, sem alteração dos documentos no banco. Na exportação Excel, esse estado aparece como **PRONTO**; no Backup JSON completo o valor original é preservado, para manter a fidelidade dos dados.
4. `Amostras` mantém apenas OCs em andamento; `Pronto` retira a OC de Amostras automaticamente.
5. Mantidos zoom, fotos, seleção de cartões, backup/exportação e importação inicial por CSV.

## Substituir arquivos pelo navegador

1. No site atual, gere um **Backup JSON** e guarde-o fora do GitHub.
2. Extraia o ZIP no computador.
3. Envie os arquivos e pastas internos para a raiz do repositório `joaovitor250p-cloud/Mb-Dryfit`, substituindo os anteriores (não envie o ZIP como um único arquivo para publicar).
4. No GitHub, abra **Actions → Publicar MB REFERENCIAS** e confira as etapas build/deploy.
5. Com ambas verdes, abra `https://joaovitor250p-cloud.github.io/Mb-Dryfit/` e pressione **Ctrl + Shift + R**.
6. Confira o botão **Backup / Exportar**, os filtros de **Cortes** e a saída de Amostras ao marcar uma OC como Pronto.

## Firestore

**Não substitua as regras de segurança.** O status `store` permanece no esquema apenas para leitura de registros antigos. Nenhuma migração é executada, e nenhuma OC é apagada por esta alteração.

## Limitação

A instalação de dependências neste ambiente falhou com `EAI_AGAIN` (registro npm inacessível); por isso não posso afirmar que o build completo foi executado. O GitHub Actions fará a compilação final.
