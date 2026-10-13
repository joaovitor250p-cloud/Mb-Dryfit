(function iniciarMarcadoresPacoteEMato(global) {
  'use strict';

  const REGISTRY = new WeakMap();

  function numeroSeguro(valor, fallback) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : fallback;
  }

  function statusSeguro(status) {
    const s = String(status || 'pendente');
    if (s === 'nao_entregue') return 'nao_entregue';
    if (s === 'entregue' || s === 'concluida') return 'concluida';
    if (s === 'parcial') return 'parcial';
    return 'pendente';
  }

  function paleta(status, selecionado) {
    if (selecionado) return { fundo: '#059669', borda: '#ffffff', numero: '#ffffff', multi: '#ffffff' };
    if (status === 'nao_entregue') return { fundo: '#ffffff', borda: '#111111', numero: '#111111', multi: '#047857' };
    if (status === 'concluida') return { fundo: '#ecfdf5', borda: '#059669', numero: '#111111', multi: '#047857' };
    if (status === 'parcial') return { fundo: '#f0fdf4', borda: '#059669', numero: '#111111', multi: '#047857' };
    return { fundo: '#ffffff', borda: '#059669', numero: '#111111', multi: '#047857' };
  }


  function chaveMultiplo(parada) {
    const numero = String(parada?.numero || (String(parada?.enderecoFonte || parada?.enderecoOriginal || '').match(/\b\d+[A-Za-z]?\b/) || [''])[0] || '').toLowerCase();
    let rua = String(parada?.logradouro || parada?.enderecoFonte || parada?.enderecoOriginal || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (numero) rua = rua.replace(new RegExp(`\\b${numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*$`, 'i'), '');
    rua = rua.replace(/\b(ap|apto|apartamento|casa|bloco|sala|loja|suite|fundos|frente)\b.*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return rua && numero ? `${rua}|${numero}` : '';
  }

  function quantidadePacotesDaParada(parada) {
    const n = Number(parada?.pacotes?.length || parada?.quantidadePacotes || 1);
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1;
  }

  function chaveFisicaMarcador(parada) {
    const chave = chaveMultiplo(parada);
    if (chave) return `end:${chave}`;
    const lat = Number(parada?.latitude), lon = Number(parada?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return `coord:${lat.toFixed(5)}|${lon.toFixed(5)}`;
    return `id:${String(parada?.id || '')}`;
  }

  function nomeIcone(prefixo, ordem, quantidade, selecionado, status) {
    const ordemInt = Math.max(1, Math.round(numeroSeguro(ordem, 1)));
    const qtdInt = Math.max(1, Math.round(numeroSeguro(quantidade, 1)));
    const statusNorm = statusSeguro(status);
    return `${prefixo}-${ordemInt}-${qtdInt}-${selecionado ? 'sel' : statusNorm}`;
  }

  function contexto2d(canvas) {
    try { return canvas.getContext('2d'); } catch (_) { return null; }
  }

  function desenharCapsula(ctx, x, y, largura, altura, raio) {
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.lineTo(x + largura - raio, y);
    ctx.quadraticCurveTo(x + largura, y, x + largura, y + raio);
    ctx.lineTo(x + largura, y + altura - raio);
    ctx.quadraticCurveTo(x + largura, y + altura, x + largura - raio, y + altura);
    ctx.lineTo(x + raio, y + altura);
    ctx.quadraticCurveTo(x, y + altura, x, y + altura - raio);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
    ctx.closePath();
  }

  function criarIcone(mapa, opcoes) {
    if (!mapa || !global.document) return '';
    const prefixo = String(opcoes?.prefixo || 'pemato-stop-v12');
    const ordem = Math.max(1, Math.round(numeroSeguro(opcoes?.ordem, 1)));
    const quantidade = Math.max(1, Math.round(numeroSeguro(opcoes?.quantidade, 1)));
    const selecionado = opcoes?.selecionado === true;
    const status = statusSeguro(opcoes?.status);
    const nome = nomeIcone(prefixo, ordem, quantidade, selecionado, status);
    if (mapa.hasImage?.(nome)) return nome;

    const ratio = Math.max(2, Math.min(3, Number(global.devicePixelRatio || 2)));
    const canvas = global.document.createElement('canvas');
    const ctx = contexto2d(canvas);
    if (!ctx) return '';

    const numero = String(ordem);
    const badge = quantidade > 1 ? `${quantidade}x` : '';
    const alturaCss = 24;

    ctx.font = '800 12px Arial, sans-serif';
    const numeroW = Math.ceil(ctx.measureText(numero).width);
    ctx.font = '700 8.5px Arial, sans-serif';
    const badgeW = badge ? Math.ceil(ctx.measureText(badge).width) : 0;
    const divisor = badge ? 1 : 0;
    const gap = badge ? 7 : 0;
    const conteudoW = numeroW + badgeW + gap + divisor;
    const larguraMin = badge ? 42 : 28;
    const larguraMax = badge ? 56 : 40;
    const larguraCss = Math.max(larguraMin, Math.min(larguraMax, conteudoW + (badge ? 16 : 14)));

    canvas.width = Math.round(larguraCss * ratio);
    canvas.height = Math.round(alturaCss * ratio);
    const c = contexto2d(canvas);
    if (!c) return '';
    c.scale(ratio, ratio);
    c.clearRect(0, 0, larguraCss, alturaCss);

    const cores = paleta(status, selecionado);
    const borda = 2;
    const x = borda / 2 + 0.5;
    const y = borda / 2 + 0.5;
    const w = larguraCss - borda - 1;
    const h = alturaCss - borda - 1;
    const r = Math.min(h / 2, 13);

    c.save();
    c.shadowColor = 'rgba(15,23,42,0.08)';
    c.shadowBlur = 1.5;
    c.shadowOffsetY = .5;
    c.fillStyle = cores.fundo;
    c.strokeStyle = cores.borda;
    c.lineWidth = borda;
    desenharCapsula(c, x, y, w, h, r);
    c.fill();
    c.shadowColor = 'transparent';
    c.stroke();
    c.restore();

    const cy = alturaCss / 2 + 0.2;
    if (!badge) {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = cores.numero;
      c.font = '800 12px Arial, sans-serif';
      c.fillText(numero, larguraCss / 2, cy);
    } else {
      c.textBaseline = 'middle';
      c.font = '800 12px Arial, sans-serif';
      const nw = c.measureText(numero).width;
      c.font = '700 9.5px Arial, sans-serif';
      const bw = c.measureText(badge).width;
      const divisorGap = 6;
      const total = nw + divisorGap + 1 + divisorGap + bw;
      let px = (larguraCss - total) / 2;

      c.textAlign = 'left';
      c.fillStyle = cores.numero;
      c.font = '800 12px Arial, sans-serif';
      c.fillText(numero, px, cy);
      px += nw + divisorGap;

      c.strokeStyle = selecionado ? 'rgba(255,255,255,0.35)' : 'rgba(5,150,105,0.28)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + 0.5, 7);
      c.lineTo(px + 0.5, alturaCss - 7);
      c.stroke();
      px += 1 + divisorGap;

      c.fillStyle = cores.multi;
      c.font = '700 8.5px Arial, sans-serif';
      c.fillText(badge, px, cy + 0.2);
    }

    try {
      mapa.addImage(nome, c.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio });
      let nomes = REGISTRY.get(mapa);
      if (!nomes) { nomes = new Set(); REGISTRY.set(mapa, nomes); }
      nomes.add(nome);
    } catch (_) {}
    return nome;
  }

  function prepararFeatures(mapa, features, opcoes) {
    const propriedadeSelecao = String(opcoes?.propriedadeSelecao || 'selected');
    const propriedadeIcone = String(opcoes?.propriedadeIcone || 'iconV12');
    const prefixo = String(opcoes?.prefixo || 'pemato-stop-v12');
    (features || []).forEach(feature => {
      const props = feature.properties || (feature.properties = {});
      const raw = props[propriedadeSelecao];
      const selecionado = raw === true || raw === 1 || raw === '1' || raw === 'true';
      props[propriedadeIcone] = criarIcone(mapa, {
        prefixo,
        ordem: props.order,
        quantidade: props.multi,
        selecionado,
        status: props.status
      });
    });
    return features;
  }

  function assinatura(features, propriedadeIcone) {
    const prop = propriedadeIcone || 'iconV12';
    return (features || []).map(feature => {
      const p = feature.properties || {};
      const c = feature.geometry?.coordinates || [];
      return `${p.id || ''}:${p.order || ''}:${p.multi || ''}:${p.status || ''}:${p[prop] || ''}:${c[0] || ''}:${c[1] || ''}`;
    }).join('|');
  }

  global.PacoteEMatoMarcadores = Object.freeze({
    criarIcone,
    prepararFeatures,
    assinatura,
    nomeIcone,
    chaveMultiplo,
    quantidadePacotesDaParada,
    chaveFisicaMarcador
  });
})(window);
