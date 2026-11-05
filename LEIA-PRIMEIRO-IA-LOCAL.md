# Assistente MB com IA local (WebLLM) — sem API cobrada por tokens

## O que foi entregue

Este pacote é **código**, não uma conta de IA e não publica nada automaticamente.

Arquivos **novos ou modificados**, para o repositório `joaovitor250p-cloud/Mb-Dryfit`:

- `src/AssistantMB.tsx` — botão flutuante existente, voz/texto, comandos reais do Firebase e botão explícito **Ativar IA local**; confirmação antes de pagamentos, preços e exclusões; validação de intenção original antes de aceitar uma sugestão do modelo.
- `src/lib/freeAI.ts` — adaptador para o modelo **local**. Substitui o cliente de API em nuvem se a versão anterior estiver instalada.
- `src/lib/assistantCommands.ts` — interpretador direto que continua funcionando sem WebGPU (incluído para evitar arquivo ausente).
- `src/local-ai.css` — estilo da ativação da IA, sem substituir o tema Monday existente.
- `public/local-model.js` — **o motor em JavaScript**: carrega o WebLLM e o modelo Qwen2.5 0.5B no dispositivo; converte frases desconhecidas para um comando; **não** tem acesso ao Firebase, ao DOM nem a chaves da conta.
- `public/ia-local-demo.html` — exemplo completo HTML + CSS + JS com tabela, chat, voz, filtros, alteração de texto, consulta, confirmação de pagamento e exclusão. **Contém somente dados fictícios** e NÃO toca no seu Firebase.
- `tests/ai-local-no-cost.test.cjs` — 11 verificações de lógica/segurança.

**Nenhum arquivo `firestore.rules`, `src/App.tsx`, `.github/workflows/deploy.yml` ou configuração de faturamento foi modificado.** O `App.tsx` atual do seu repositório já importa `<AssistantMB />` e fornece as permissões de acesso. Por isso não é necessário modificá-lo.

## 1. Como publicar no MB REFERÊNCIAS

1. Faça um backup do repositório atual.
2. Extraia este ZIP. Envie os arquivos mantendo a estrutura de pastas indicada. **Não** coloque os `.tsx` diretamente na raiz.
3. No GitHub Actions, confirme que a etapa **Compilar aplicação** e a etapa **Publicar site** terminam com sucesso.
4. Abra o site, entre com seu usuário e clique no **Assistente MB** no canto inferior direito. A interação por comandos conhecidos funciona mesmo sem ativar IA local.
5. Em navegador com WebGPU, clique em **Ativar IA local**. O site avisará sobre o primeiro download e mostrará o progresso. Use uma rede Wi-Fi e aparelho com RAM livre.
6. Teste primeiro com perguntas que não alteram dados: “Quanto devo ao Mauro?”, “Qual é o PIX do Virgílio?” e “Quais OCs estão pendentes?”.
7. Para testar o protótipo isolado, abra **`https://joaovitor250p-cloud.github.io/Mb-Dryfit/ia-local-demo.html`** após publicar. Ele contém apenas **dados fictícios**, mesmo quando você está logado no aplicativo.

Nenhuma chave API, token de IA, cadastro de cartão, Worker ou servidor extra é exigido pelo modelo local. **Não é necessário ativar o Gemini, Cloudflare ou seguir o guia da integração de IA em nuvem anterior.**

## 2. Arquitetura

```
GitHub Pages (React, Vite) + Firebase já existente
          |                           |
          |                           +--> permissões e dados reais
          v
     Assistente MB
          |
          +--> texto/voz (reconhecimento depende do navegador)
          |
          +--> interpretador de comandos diretos (rápido, sem modelo)
          |
          +--> [clique explícito] IA local WebLLM + Qwen 0.5B
                               |
                               +--> sugestão de comando textual (NÃO confiável)
                                             |
                                       validação e confirmação
                                             |
                                operação autorizada no Firestore
```

O motor está em `public/local-model.js`. Ao ativar, ele baixa código JavaScript da CDN pública `esm.sh` e os pesos públicos do modelo. **O pedido não é enviado a um serviço de inferência pago**: a geração ocorre no navegador. O código e pesos ficam sujeitos à disponibilidade, licença, limites e políticas das fontes públicas de download. Não existe garantia de CDN gratuita eterna. Depois do primeiro download, o cache do navegador pode acelerar carregamentos, mas não é garantia de offline total.

**Privacidade:** o texto das perguntas não é enviado à API de IA nesta versão. A fala pode ser processada pelo fornecedor do reconhecimento de voz do navegador; voz não é necessariamente offline. As consultas ao Firebase seguem as regras normais do site.

## 3. Requisitos, desempenho e limitações reais

- Necessita **HTTPS** e navegador com **WebGPU** (Chrome/Edge atuais em aparelhos compatíveis). Não funciona com IA gerativa local em todos os celulares Android; nesse caso, os comandos locais continuam disponíveis.
- Modelo padrão: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (~centenas de MB de download, dependendo do formato/versão). Não é comparável em inteligência a modelos grandes de nuvem. Pode responder mal em português, entender incorretamente situações complexas ou não retornar JSON válido.
- O processamento consome RAM/GPU/energia do dispositivo e pode ser lento. Aceleração gráfica e downloads dependem do navegador. **Não é possível garantir uso leve para todos os visitantes**.
- O modelo propõe apenas operações permitidas. O aplicativo não aceita `eval`, JavaScript gerado ou seletor DOM arbitrário. Alterações financeiras e exclusões pedem confirmação.
- A IA não consegue “fazer tudo”: as operações reais disponíveis continuam restritas às capacidades já implementadas no `AssistantMB.tsx` (OCs, amostras, referência padrão, PIX, relatórios e pagamentos). Para novos comandos, devem ser criadas operações validadas e regras Firestore adequadas.
- A demonstração altera elementos da própria página (título, filtro, tabela) sem acessar dados reais. Para fazer o mesmo com módulos de produção, conecte essas ações a funções explícitas do React/Firebase, não manipule HTML arbitrário das telas.

## 4. Como testar sem qualquer deploy

Os testes de lógica podem ser executados com Node 20+:

```bash
node --test tests/ai-local-no-cost.test.cjs
```

O exemplo HTML precisa ser servido em HTTP local, ou GitHub Pages (não use `file://` para testar WebGPU/CDNs). Dentro do repositório, no computador:

```bash
python -m http.server 8000 --directory public
```

Abra `http://localhost:8000/ia-local-demo.html`. Para usar a IA, o navegador precisa suportar WebGPU; `localhost` é uma origem segura para navegadores modernos. **Não é necessária uma conexão com Firebase** para o exemplo.

## 5. Custo zero: exatamente o que significa

- **R$ 0,00 de API de IA por requisição**: não há chamada à Gemini/OpenAI/Anthropic nem chave paga.
- **Sem servidor de IA**: o modelo roda no dispositivo de cada visitante.
- **Hospedagem**: o site pode usar o GitHub Pages no regime gratuito, sujeito às condições/quotas do GitHub; isso não garante que qualquer serviço externo usado pelo projeto seja sempre gratuito.
- **Firebase**: o armazenamento e as consultas continuam sujeitos às cotas e ao plano da sua conta; esta atualização não altera o faturamento dele.
- **Internet/energia/hardware** de quem usa o sistema não são gratuitos automaticamente.

## 6. O que foi testado aqui

- `node --test`: 11 testes de validação e segurança passaram.
- `node --check`: sintaxe de JavaScript aprovada.
- TypeScript: verificação de **transpilação/sintaxe** dos arquivos modificados passou.
- **Não testado:** compilação Vite completa com dependências (ausentes neste ambiente), download do WebLLM/modelo via internet (rede restrita), interação real no navegador (ambiente de teste bloqueou abertura local), gravação real no seu Firebase e microfone em Android. Esses passos precisam ser validados antes de usar em produção.

## 7. Segurança de produção

O navegador é um cliente não confiável. Confirme as regras de segurança publicadas do Firebase (admin, editores, visualizadores), inclusive para exclusões e edições; o modelo de IA não substitui autenticação. Use OCs de teste, faça backup e não divulgue PIX e outros dados a usuários sem permissão adequada. Não remova a etapa de confirmação de operações.
