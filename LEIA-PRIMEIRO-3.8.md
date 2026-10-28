# MB REFERENCIAS 3.8 — Amostras / Cortes + planilha de produção

## Organização
- **Amostras:** Adicionar amostra, Importar OCs do CSV (uma vez), editar amostra e adicionar/trocar foto individual, seleção de cartões e exclusão.
- **Cortes:** somente visualização das imagens em **Em andamento** ou **Prontos**; em andamento tem um único botão de ação: **Pronto**. Foto com zoom disponível nas duas páginas.
- A OC marcada **Pronto** deixa de aparecer em Amostras. As OCs antigas no status `store` continuam listadas em Prontos.

## CSV fornecido pelo usuário
- `exemplos/MOVIMENTACAO-DE-CORTE-ORIGINAL.csv` preservado, com 21 OCs, todas A FAZER, 9 sem oficina/costureiro e sem coluna REF.
- O botão **Usar planilha enviada (21 OCs)** já oferece a prévia, sem precisar carregar manualmente. Também existe escolha de outro CSV.
- As 9 oficinas vazias serão salvas como `NÃO INFORMADO` para permitir o cadastro sem inventar um profissional e para você editar depois.
- Nomes genéricos do CSV são mantidos como vieram. Sem REF, não há atribuição automática por semelhança. As fotos podem ser adicionadas depois na área **Amostras**.
- A coluna DATA está como `27/out` sem ano; o texto é registrado no histórico da importação, não interpretado como uma data completa.

## Publicação
1. Faça Backup JSON dos modelos e OCs.
2. Extraia o ZIP, envie **o conteúdo** ao repositório `joaovitor250p-cloud/Mb-Dryfit`, mantendo `.github`.
3. Confirme build + deploy verdes em GitHub Actions.
4. Entre em **Amostras → Importar OCs do CSV → Usar planilha enviada (21 OCs)**, confira e confirme. Registros de OCs existentes são ignorados, não substituídos.
5. A importação inicial só fica desativada **após marcar o resultado completo** no histórico; em caso de falha parcial, pode repetir para criar apenas OCs pendentes.
6. Adicione fotos específicas nos cartões de Amostras, inclusive onde o nome do modelo não coincide com o catálogo principal.
7. Confira os cortes em andamento; clique **Pronto** e verifique que saem de Amostras e passam para a aba Prontos de Cortes.

Não requer mudança de regras Firestore para os campos importados. O app não foi conectado ao Firebase real nem publicado diretamente nesta preparação.
