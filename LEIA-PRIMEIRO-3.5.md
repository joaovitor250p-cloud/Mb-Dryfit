# MB REFERENCIAS 3.5 — botão Chegou na loja sem confirmação

## Problema identificado
O arquivo `src/SampleWorkflow.tsx` continha um `window.confirm()` exclusivo da ação `store`. Por isso, o botão **Pronto** funcionava de imediato, mas **Chegou na loja** abria a janela Aceitar/Cancelar.

## Correção
A confirmação foi retirada. Agora, ao clicar em **Chegou na loja**, o programa chama diretamente a mesma função `mark()` que o botão **Pronto** utiliza; envia a atualização da OC ao Firestore e muda para a aba de destino após o servidor confirmar.

Nenhuma regra do Firebase foi modificada, nenhuma foto foi removida e nenhuma coleção foi apagada. A exclusão de cartões continua pedindo confirmação de segurança.

## Atualização mais simples pelo navegador
1. Abra `src/SampleWorkflow.tsx` no GitHub e substitua pelo arquivo corrigido.
2. Faça commit na branch `main`.
3. Confira o GitHub Actions e atualize o site com `Ctrl + Shift + R`.

Ou envie o conteúdo completo do ZIP para substituir os arquivos do projeto.

## Limites do teste
A análise confirmou a remoção da caixa `window.confirm`. Um `permission-denied` ou outro erro do Firestore ainda pode impedir a gravação. Esse ajuste não publica regras do banco nem testa credenciais de produção.
