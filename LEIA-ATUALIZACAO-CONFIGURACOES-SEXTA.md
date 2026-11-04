# MB REFERÊNCIAS — Reorganização de menus, Oficinas e Pagamento de Sexta

## O que mudou

1. **Configurações:** Informações MB, Oficinas e Preços de REF estão no mesmo menu, em guias separadas. Não foram criadas permissões novas: continuam valendo as permissões antigas de cada área.
2. **Amostras:** a antiga página Cortes virou uma guia dentro de Amostras; os dados e os botões da área de Cortes foram mantidos. Os formulários permanecem montados entre as guias já abertas.
3. **Oficinas:** retirada a consulta e download das OCs (isso elimina a assinatura em tempo real de `cut_orders` nessa página). A seção antiga “Peças e preços” foi retirada do visual e do formulário, mas os serviços que existiam continuam preservados no banco quando você edita a oficina. A tabela de oficinas ficou compacta e pesquisável; inclui nome, tipos produzidos, telefone, PIX, endereço e ações de edição. Preços especiais por REF continuam disponíveis no cadastro de oficina, em uma seção expansível.
4. **Endereços:** novo campo `address` nos documentos `workshops`. Os documentos antigos, sem endereço, continuam válidos.
5. **Ordem de Corte:** a planilha usa uma única visualização de resumo com mais informações acessíveis ao rolar para a direita; as antigas opções “Produção e datas”, “Valores e pagamento” e “Todas as colunas” deixaram de aparecer. Há barra horizontal acima e abaixo da tabela. Edição, busca, filtros, download e exclusão de OCs foram mantidos.
6. **Pagamento de Sexta:** seleção da sexta usada como data do pagamento; agora é possível confirmar uma OC ou todas de uma oficina. A ação grava `paymentDone:'OK'` e `paidAt:DD/MM/AAAA` no mesmo documento em `cut_orders`, atualizando o resumo em tempo real. A tela mostra as OCs pagas naquela sexta. Abriu a oficina no fechamento? Há PIX e botão para copiar. **O aplicativo não realiza transferência bancária.**
7. **Visual:** ajustes em espaçamentos, abas, botões, cadastro de oficinas, listas e tabela horizontal para computador e celular, mantendo tema claro/escuro.

## IMPORTANTE — Publicação do Firestore

**É indispensável publicar também o arquivo `firestore.rules`.** Ele aceita o campo opcional `address` e libera a leitura dos contatos de oficinas para quem possui permissão de edição de Ordens de Corte, necessária para mostrar o PIX na sexta-feira. Isso dá acesso de leitura ao cadastro completo das oficinas para esse perfil (inclusive valores especiais), sem autorização para editá-lo.

As regras **não** são publicadas automaticamente pelo deploy no GitHub Pages. No console do Firebase, entre em Firestore Database > Regras, faça backup das regras atuais, confira as diferenças e publique a versão enviada. Não substitua regras de outro projeto Firebase.

## Como atualizar o site

1. Faça backup do projeto atual e dos dados do Firebase.
2. Extraia este ZIP e copie os arquivos para seu repositório do projeto. Não apague `.git`, nem substitua sua configuração local `.env` do Firebase.
3. Envie para `main`; o workflow existente roda `npm install`, `npm run test:preflight`, `npm run build` e publica o GitHub Pages.
4. Aguarde o GitHub Actions ficar verde antes de testar no site.
5. Publique as novas regras do Firestore para os campos de endereço e PIX no fechamento.

## Testes recomendados no site publicado

- Configurações: cadastrar endereço, PIX e WhatsApp, salvar, sair da aba, voltar e verificar.
- Oficinas: conferir que não aparecem OCs e “Peças e preços” antigos; conferir que preços especiais por referência ainda são editáveis.
- Amostras > Cortes: abrir formulário, trocar para Amostras e voltar sem perder dados digitados; marcar corte pronto.
- Ordem de Corte: pesquisar OC, percorrer colunas pela barra horizontal, editar e salvar uma OC de teste.
- Sexta-feira: usar OC de teste entregue e pendente, escolher sexta, copiar PIX da oficina, marcar uma OC como paga, voltar ao resumo e verificar `Pagamento = Pago` e `Data pagamento` igual à sexta selecionada. Repetir com duas OCs para “Confirmar todas”.
- Fichas: enviar uma ficha de teste, distribuir e confirmar que a criação automática da OC continua funcionando.

## Resultados de validação neste ambiente

- **12 testes de pré-verificação: aprovados**. Abrangem referências, sintaxe isolada dos arquivos TS/TSX, vínculo da OC, menu agrupado, endereço opcional, não carregar OCs em Oficinas, tabela horizontal e gravação de status/data na coleção `cut_orders`.
- **Node (`functions/index.js`): sintaxe verificada**.
- **`npm run build`: NÃO concluído**. React, Firebase, Lucide e respectivos tipos não estão instalados neste ambiente, então o TypeScript informou módulos ausentes antes de chegar ao Vite. Não houve deploy ou acesso ao banco Firebase real nesta revisão.
- **Nenhum dado real alterado**. Os testes foram estáticos/isolados; a integração de pagamento e PIX ainda precisa ser validada com OC de teste no seu Firebase.

## Limites da edição

Os valores/pagamentos que estiverem no Firebase não são apagados automaticamente. A seção “Peças e preços” deixou de ser exibida e editada, mas os valores históricos de `services` são preservados durante novas edições. A criação automática da Ordem de Corte e suas regras foram preservadas sem refatoração nesta revisão.
