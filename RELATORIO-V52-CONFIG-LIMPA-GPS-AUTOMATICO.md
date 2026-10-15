# V52 — Configurações limpas e GPS automático

- Removido da tela de Configurações o bloco **Ponto de partida**.
- Removido da tela de Configurações o bloco técnico **Serviço de rotas**.
- O Worker continua configurado internamente em `js/mapa/config.js`; o motorista não precisa editar a URL.
- A otimização passa a atualizar automaticamente a origem pela localização GPS atual.
- Preferências antigas de ponto inicial não são mais usadas como configuração global.
- Se a leitura de GPS falhar durante uma rota já carregada, uma origem válida existente pode ser usada como contingência.
