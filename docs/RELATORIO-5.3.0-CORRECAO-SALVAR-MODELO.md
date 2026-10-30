# MB REFERÊNCIAS 5.3.0 — Correção do cadastro de modelos

## Problema analisado

Na versão anterior, o cadastro de um modelo novo gravava o documento `models/{id}` e o registro de histórico `audit_log/{id}` dentro do mesmo `writeBatch`. Como o Firestore executa o lote de forma atômica, uma recusa de permissão ou incompatibilidade na regra do histórico cancelava também a criação do modelo. A interface apresentava somente a mensagem genérica do provedor e não mantinha uma explicação clara dentro do formulário.

## Alterações

- A criação do modelo agora é feita em transação própria, com leitura do ID antes da gravação para impedir duplicidade concorrente.
- O histórico é gravado depois, de forma independente. Se a gravação do histórico falhar, o modelo permanece salvo e a interface informa isso explicitamente.
- Erros de permissão, sessão, conexão, limite de gravação e duplicidade recebem mensagens específicas.
- A mensagem de erro permanece visível dentro do formulário para facilitar o diagnóstico.
- Foram adicionadas validações locais compatíveis com as regras atuais: nome até 250 caracteres, referência até 200 e foto até 90.000 caracteres.
- A geração do ID mantém o formato antigo para nomes comuns e evita exceder o limite de tamanho do Firestore em nomes excepcionalmente longos.
- O pacote mantém as correções da versão 5.2.0 para Amostras, Cortes e visualizador.

## Segurança e dados

- Não há exclusão ou migração de documentos existentes.
- Não há alteração dos Secrets ou da configuração do Firebase.
- A criação continua exigindo perfil Administrador/Editor com permissão de Catálogo, conforme `firestore.rules`.
- Nenhuma publicação foi realizada.

## Validação

- Arquivos TypeScript/TSX analisados sintaticamente com o compilador TypeScript.
- JSONs validados.
- Integridade do ZIP validada.
- A compilação completa (`npm run build`) depende da instalação das dependências npm; a instalação não concluiu neste ambiente por indisponibilidade/timeout do registry.
