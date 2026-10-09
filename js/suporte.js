function abrirSuporteWhatsApp() {
  const numero = '5511990059547';
  const mensagem = encodeURIComponent('Olá, preciso de suporte no app Pacote É Mato');
  window.location.href = `https://wa.me/${numero}?text=${mensagem}`;
}
