# Análise de desempenho — versão 4.14

## Melhorias aplicadas

1. **Divisão por tela:** cada área é carregada quando aberta, em vez de incluir todos os componentes no primeiro carregamento.
2. **Planilhas sob demanda:** `xlsx` é carregado somente quando alguém escolhe importar uma planilha. Backup/Exportar também é uma tela carregada sob demanda.
3. **Logo otimizada:** WebP com transparência, aproximadamente 76% menor que o PNG anterior.
4. **Fotos das Amostras:** a listagem recebe a foto principal; as fotos 2 e 3 são consultadas sob demanda e apenas na OC visível.
5. **Sem duplicação de componentes:** a raiz não contém mais cópias antigas das telas usadas em `src/`.

## Pontos que ainda podem exigir evolução

- O Catálogo ainda recebe as fotos de modelo que estão armazenadas nos documentos Firestore. Se o volume crescer bastante, uma migração planejada para Firebase Storage pode reduzir o tráfego; isso exige backup e migração controlada.
- A lista de Amostras/Cortes ainda observa todos os documentos de `production_samples`. Se o volume aumentar muito, avaliar paginação por status/data e índices do Firestore.
- As fotos adicionais das amostras são carregadas apenas para cartões visíveis, mas cada imagem ainda é um dado base64 no Firestore. Para volumes maiores, Storage será mais adequado.

## Segurança

Nenhuma regra foi aberta globalmente. Não altere as permissões apenas para tentar acelerar o sistema.
