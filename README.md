# Atualização 3.3

Leia primeiro `LEIA-PRIMEIRO-3.3.md` para instalar a nova versão.

# MB REFERENCIAS — Correção de fotos e cortes (revisão 28/10/2026)

## O que mudou nesta edição

**Fotos iniciais sem gravação de URL no Firestore:** As 175 correspondências de fotos enviadas pelo usuário foram incorporadas ao frontend como um catálogo público inicial (`src/lib/photoCatalogSeed.json`). Somente modelos que já existem no banco e correspondem EXATAMENTE por nome normalizado + REF recebem essas fotos na tela. Os 19 modelos restantes continuam sem foto. Essa solução elimina a falha `permission-denied` para a apresentação das 175 fotos porque não precisa gravar uma URL externa em `models.imageData`.

**Importante:** essas 175 fotos **não foram inseridas no Firestore**. São imagens carregadas diretamente do endereço público Nex/Google Cloud Storage, a partir da versão publicada no GitHub; se as URLs do fornecedor forem removidas, precisarão ser atualizadas. O código público do site contém as associações de foto com modelos. Fotos carregadas manualmente para `models.imageData` continuam tendo preferência e permanecem guardadas no Firebase. Nenhuma foto existente foi substituída.

**Novas fotos por URL:** o programa tenta baixar e compactar o arquivo no navegador usando CORS, do mesmo modo que um upload manual (data URI), e salva o resultado após validar. Caso o servidor bloqueie CORS, ele informa a limitação e pede upload do arquivo local, sem registrar sucesso falso.

**Cortes:** `Foi pra loja` altera só o status e os metadados. O status é gravado diretamente em `production_samples`; depois o sistema tenta registrar a ação em `audit_log`. Se apenas o histórico for negado, a tela informa que o status foi salvo, mas o histórico ficou pendente. Não recria a OC nem altera a foto.

## Publicar pelo navegador (GitHub Pages)

1. Faça Backup JSON no site antes de substituir arquivos.
2. Extraia o ZIP e envie os arquivos internos para a raiz do repositório `joaovitor250p-cloud/Mb-Dryfit` (preserve subpastas `src/` e `.github/`). Não inclua uma pasta extra ao redor dos arquivos.
3. Verifique `GitHub > Actions > Publicar MB REFERENCIAS` e só use o site quando **build** e **deploy** ficarem verdes.
4. Abra `https://joaovitor250p-cloud.github.io/Mb-Dryfit/` e pressione Ctrl+Shift+R.
5. Os cartões devem mostrar as fotos do CSV inicial automaticamente (sem clicar Importar CSV). Pesquise a REF.10359 e confirme o modelo.
6. Uma foto já salva manualmente no Firebase tem prioridade sobre a foto do CSV. Se ela estiver errada, selecione **Trocar foto**, escolha o arquivo local e salve.
7. Em Cortes > Prontos, teste uma OC de teste com **Foi pra loja**. Confirme que passou para a terceira aba após F5.

## Firestore

A mudança das 175 fotos NÃO exige atualização de regras do Firestore porque não grava as URLs no banco. O arquivo `firestore.rules` foi preservado do pacote anterior para referência; **não publique regras novas apenas por causa das fotos**. Se o envio à loja falhar por `permission-denied`, examine a regra **publicada** de `production_samples` e a mensagem específica gerada pelo código. O GitHub Pages não publica as regras do Firebase.

As regras legadas de `/usuarios` incluem uma leitura pública por número de WhatsApp (`allow get: if true`), que representa um risco de privacidade já existente. Não amplie essa permissão.

## Testes e limites

- Comparação dos CSVs: 175 fotos associadas por nome + REF entre 194 modelos, 19 modelos sem correspondência; nenhuma colisão encontrada.
- TypeScript/TSX: análise de sintaxe feita com compilador TypeScript local (0 erros de parsing).
- Integridade do ZIP: verificação efetuada.
- `npm install` / `npm run build`: **não concluídos** neste ambiente por falha DNS `EAI_AGAIN` em registry.npmjs.org. Portanto, build completo e autenticação Firebase em execução **não estão validados**. A etapa GitHub Actions é obrigatória.
- Não foi possível executar gravações no Firebase ativo nem alterar o repositório: a conexão GitHub deste ambiente tem leitura, mas não tem `push`.
