(function iniciarImportadorXlsx(global) {
  'use strict';

  const aliases = {
    endereco: [
      'endereco', 'endereço', 'address', 'destination address', 'endereco completo', 'endereço completo', 'local', 'destino',
      'endereco da entrega', 'endereço da entrega', 'endereco destino', 'endereço destino',
      'endereco do cliente', 'endereço do cliente', 'endereco destinatario', 'endereço destinatário',
      'endereco de entrega', 'endereço de entrega', 'local de entrega'
    ],
    logradouro: ['logradouro', 'rua', 'avenida', 'av', 'street', 'via', 'nome da rua', 'nome do logradouro'],
    numero: ['numero', 'número', 'num', 'nº', 'n°', 'number', 'numero endereco', 'número endereço', 'numero do imovel', 'número do imóvel'],
    complemento: ['complemento', 'comp', 'complement', 'referencia', 'referência', 'ponto de referencia', 'ponto de referência'],
    apartamento: ['apartamento', 'apto', 'apt', 'ap'],
    bloco: ['bloco', 'block'],
    sala: ['sala', 'suite'],
    loja: ['loja', 'store'],
    bairro: ['bairro', 'neighborhood'],
    cidade: ['cidade', 'city', 'municipio', 'município', 'localidade'],
    estado: ['estado', 'uf', 'state'],
    cep: ['cep', 'postal code', 'zipcode', 'zip', 'codigo postal', 'código postal'],
    observacao: ['observacao', 'observação', 'obs', 'nota', 'notas', 'notes', 'instructions', 'instrucoes', 'instruções', 'observacoes', 'observações'],
    id: ['id', 'stop id', 'parada id', 'codigo parada', 'código parada', 'id parada', 'numero parada', 'número parada'],
    atId: ['at id', 'atid', 'route id', 'rota id', 'id da rota', 'id do lote'],
    sequenceOrigem: ['sequence', 'sequencia', 'sequência', 'ordem origem', 'sequencia origem', 'sequência origem'],
    stopOrigem: ['stop', 'stop number', 'parada origem', 'parada original'],
    pacote: ['pacote', 'spx tn', 'spxtn', 'tn', 'codigo pacote', 'código pacote', 'codigo', 'código', 'tracking', 'tracking code', 'etiqueta', 'package', 'codigo de rastreio', 'código de rastreio'],
    pacotes: ['pacotes', 'codigos pacotes', 'códigos pacotes', 'trackings', 'packages', 'etiquetas'],
    latitude: ['latitude', 'lat', 'coord lat', 'coordenada latitude'],
    longitude: ['longitude', 'lon', 'lng', 'long', 'coord lon', 'coordenada longitude']
  };

  const CAMPOS_MAPEAVEIS = [
    ['endereco', 'Destination Address'],
    ['logradouro', 'Logradouro / rua'],
    ['numero', 'Número'],
    ['cidade', 'City'],
    ['estado', 'Estado / UF'],
    ['cep', 'Zipcode/Postal code'],
    ['complemento', 'Complemento'],
    ['apartamento', 'Apartamento'],
    ['bloco', 'Bloco'],
    ['sala', 'Sala'],
    ['loja', 'Loja'],
    ['bairro', 'Bairro'],
    ['atId', 'AT ID'],
    ['sequenceOrigem', 'Sequence'],
    ['stopOrigem', 'Stop'],
    ['pacote', 'SPX TN'],
    ['pacotes', 'Códigos de pacotes'],
    ['observacao', 'Observação'],
    ['id', 'ID da parada'],
    ['latitude', 'Latitude'],
    ['longitude', 'Longitude']
  ];

  function normalizarCabecalho(v) {
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const aliasNorm = Object.fromEntries(Object.entries(aliases).map(([key, arr]) => [
    key,
    [...new Set(arr.map(normalizarCabecalho).filter(Boolean))]
  ]));

  function cabecalhoCombina(norm, campo) {
    const lista = aliasNorm[campo] || [];
    if (!norm) return false;
    if (lista.includes(norm)) return true;
    return lista.some(alias => {
      if (alias.length < 4) return false;
      return norm.includes(alias);
    });
  }

  function identificarColunas(headers) {
    const mapa = {};
    (headers || []).forEach((header, index) => {
      const norm = normalizarCabecalho(header);
      if (!norm) return;
      Object.keys(aliasNorm).forEach(campo => {
        if (!(campo in mapa) && cabecalhoCombina(norm, campo)) mapa[campo] = index;
      });
    });
    return mapa;
  }

  function linhaVazia(row) {
    return !Array.isArray(row) || !row.some(cell => String(cell ?? '').trim());
  }

  function pontuarCabecalho(row) {
    if (!Array.isArray(row)) return { score: -1, columns: {}, nonEmpty: 0 };
    const headers = row.map(v => String(v ?? '').trim());
    const columns = identificarColunas(headers);
    const campos = Object.keys(columns);
    const nonEmpty = headers.filter(Boolean).length;
    let score = campos.length * 4;
    if (columns.endereco != null || columns.logradouro != null) score += 12;
    if (columns.numero != null) score += 3;
    if (columns.cidade != null || columns.cep != null) score += 2;
    if (columns.pacote != null || columns.pacotes != null) score += 2;
    if (nonEmpty >= 2) score += Math.min(4, nonEmpty);
    return { score, columns, nonEmpty, headers };
  }

  function detectarCabecalho(matriz) {
    const rows = Array.isArray(matriz) ? matriz : [];
    if (!rows.length) return { headerIndex: -1, headers: [], columns: {} };
    let melhor = null;
    const limite = Math.min(rows.length, 30);
    for (let i = 0; i < limite; i++) {
      if (linhaVazia(rows[i])) continue;
      const info = pontuarCabecalho(rows[i]);
      if (!melhor || info.score > melhor.score) melhor = { ...info, headerIndex: i };
    }
    if (melhor && (melhor.score >= 10 || melhor.columns.endereco != null || melhor.columns.logradouro != null)) {
      return melhor;
    }
    const fallbackIndex = rows.findIndex(row => Array.isArray(row) && row.filter(v => String(v ?? '').trim()).length >= 2);
    if (fallbackIndex >= 0) {
      const info = pontuarCabecalho(rows[fallbackIndex]);
      return { ...info, headerIndex: fallbackIndex };
    }
    const first = rows.findIndex(row => !linhaVazia(row));
    if (first >= 0) {
      const info = pontuarCabecalho(rows[first]);
      return { ...info, headerIndex: first };
    }
    return { headerIndex: -1, headers: [], columns: {} };
  }

  function detectarPerfil(headers) {
    const norm = new Set((headers || []).map(normalizarCabecalho).filter(Boolean));
    const obrigatoriasSPX = ['at id', 'spx tn', 'destination address', 'bairro', 'city', 'zipcode postal code', 'latitude', 'longitude'];
    const encontrados = obrigatoriasSPX.filter(item => norm.has(normalizarCabecalho(item))).length;
    if (encontrados >= 7 && norm.has('spx tn') && norm.has('destination address')) return 'spx';
    return 'generico';
  }

  function normalizarMapeamento(mapping) {
    const out = {};
    Object.entries(mapping || {}).forEach(([campo, indice]) => {
      const n = Number(indice);
      if (Number.isInteger(n) && n >= 0) out[campo] = n;
    });
    return out;
  }

  function valor(row, columns, key) {
    const idx = columns[key];
    return idx == null ? '' : String(row?.[idx] ?? '').trim();
  }

  function extrairPacotes(row, columns) {
    const textos = [];
    ['pacote', 'pacotes'].forEach(key => {
      const v = valor(row, columns, key);
      if (v) textos.push(v);
    });
    if (!textos.length && Array.isArray(row)) {
      row.forEach(cell => {
        const t = String(cell ?? '');
        if (/\bBR[A-Za-z0-9]{8,25}\b/i.test(t)) textos.push(t);
      });
    }
    const encontrados = [];
    textos.forEach(texto => {
      const brs = String(texto).match(/BR[A-Za-z0-9]{8,25}/gi) || [];
      if (brs.length) brs.forEach(v => encontrados.push(v.toUpperCase()));
      else String(texto).split(/[;,|\n]+/).map(v => v.trim()).filter(Boolean).forEach(v => encontrados.push(v));
    });
    return [...new Set(encontrados)];
  }

  function inferirNumeroEndereco(endereco) {
    const texto = String(endereco || '').trim();
    if (!texto) return '';
    // Arquivos SPX costumam usar: "Logradouro, número, complemento".
    // Prioriza o primeiro número logo após uma vírgula para não confundir
    // nomes de vias como "Rua Dois de Julho" ou "Rua 24 de Maio".
    const aposVirgula = texto.match(/,\s*(\d+[A-Za-z]?(?:[-\/]\d+[A-Za-z]?)?)\b/);
    if (aposVirgula) return aposVirgula[1];
    const antesVirgula = texto.match(/\s(\d+[A-Za-z]?)\s*,/);
    if (antesVirgula) return antesVirgula[1];
    const numeroFinal = texto.match(/\s(\d+[A-Za-z]?)\s*(?:$|[-–—])/);
    return numeroFinal ? numeroFinal[1] : '';
  }

  function montarEndereco(campos) {
    const enderecoCompleto = String(campos.endereco || '').trim();
    let base = enderecoCompleto;
    if (!base) base = [campos.logradouro, campos.numero].filter(Boolean).join(', ');
    else if (campos.numero && !new RegExp(`\\b${String(campos.numero).replace(/[^0-9A-Za-z]/g, '')}\\b`, 'i').test(base.replace(/[^0-9A-Za-z ]/g, ' '))) {
      base = `${base}, ${campos.numero}`;
    }
    const localidade = [campos.bairro, campos.cidade, campos.estado, campos.cep].filter(Boolean).join(', ');
    return [base, localidade].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
  }

  function hashLinha(row, index) {
    let h = 2166136261;
    const texto = `${index}|${(row || []).map(v => String(v ?? '')).join('|')}`;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function converterLinhas(matriz, nomeArquivo, opcoes) {
    const rows = Array.isArray(matriz) ? matriz : [];
    if (!rows.length) throw new Error('A planilha está vazia.');

    const detectado = detectarCabecalho(rows);
    const headerIndex = Number.isInteger(opcoes?.headerIndex) ? opcoes.headerIndex : detectado.headerIndex;
    if (headerIndex < 0 || !rows[headerIndex]) throw new Error('Não consegui identificar a linha de cabeçalho da planilha.');
    const headers = rows[headerIndex].map(v => String(v ?? '').trim());
    const columns = Object.assign({}, identificarColunas(headers), normalizarMapeamento(opcoes?.columnMapping));

    if (columns.endereco == null && columns.logradouro == null) {
      const erro = new Error('Não encontrei uma coluna de endereço. Associe a coluna de Endereço completo ou Logradouro.');
      erro.code = 'MAPEAMENTO_NECESSARIO';
      erro.headers = headers;
      erro.headerIndex = headerIndex;
      throw erro;
    }

    const paradas = [];
    const erros = [];
    const porIdExplicito = new Map();
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || linhaVazia(row)) continue;

      const campos = {
        endereco: valor(row, columns, 'endereco'),
        logradouro: valor(row, columns, 'logradouro'),
        numero: valor(row, columns, 'numero'),
        complemento: valor(row, columns, 'complemento'),
        apartamento: valor(row, columns, 'apartamento'),
        bloco: valor(row, columns, 'bloco'),
        sala: valor(row, columns, 'sala'),
        loja: valor(row, columns, 'loja'),
        bairro: valor(row, columns, 'bairro'),
        cidade: valor(row, columns, 'cidade'),
        estado: valor(row, columns, 'estado'),
        cep: valor(row, columns, 'cep'),
        observacao: valor(row, columns, 'observacao'),
        atId: valor(row, columns, 'atId'),
        sequenceOrigem: valor(row, columns, 'sequenceOrigem'),
        stopOrigem: valor(row, columns, 'stopOrigem'),
        latitude: valor(row, columns, 'latitude'),
        longitude: valor(row, columns, 'longitude')
      };
      if (!campos.numero && campos.endereco) campos.numero = inferirNumeroEndereco(campos.endereco);
      const enderecoOriginal = montarEndereco(campos);
      if (!enderecoOriginal) {
        erros.push({ linha: i + 1, motivo: 'Endereço vazio' });
        continue;
      }

      const pacotes = extrairPacotes(row, columns);
      const idPlanilha = valor(row, columns, 'id');
      const idBase = idPlanilha ? `xlsx-${idPlanilha.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}` : `xlsx-${hashLinha(row, i)}`;

      if (idPlanilha && porIdExplicito.has(idBase)) {
        const existente = porIdExplicito.get(idBase);
        if (normalizarCabecalho(existente.enderecoOriginal) === normalizarCabecalho(enderecoOriginal)) {
          existente.pacotes = [...new Set([...(existente.pacotes || []), ...pacotes])];
          existente.quantidadePacotes = existente.pacotes.length;
          if (campos.observacao && !String(existente.observacao || '').includes(campos.observacao)) {
            existente.observacao = [existente.observacao, campos.observacao].filter(Boolean).join(' | ');
          }
          if (!Array.isArray(existente.fonte.linhas)) existente.fonte.linhas = [existente.fonte.linha];
          existente.fonte.linhas.push(i + 1);
          continue;
        }
        erros.push({ linha: i + 1, motivo: `ID de parada repetido com endereço diferente: ${idPlanilha}` });
      }

      const latTexto = String(campos.latitude || '').replace(',', '.').trim();
      const lonTexto = String(campos.longitude || '').replace(',', '.').trim();
      const latNumero = latTexto === '' ? null : Number(latTexto);
      const lonNumero = lonTexto === '' ? null : Number(lonTexto);
      const coordenadaPlanilhaValida = latNumero !== null && lonNumero !== null && Number.isFinite(latNumero) && Number.isFinite(lonNumero) && Math.abs(latNumero) <= 90 && Math.abs(lonNumero) <= 180;
      if ((latTexto || lonTexto) && !coordenadaPlanilhaValida) erros.push({ linha: i + 1, motivo: 'Latitude/longitude incompletas ou inválidas; a parada foi importada sem coordenadas.' });

      const parada = {
        id: idPlanilha && porIdExplicito.has(idBase) ? `${idBase}-linha-${i + 1}` : idBase,
        ordemOriginal: paradas.length + 1,
        ordemOtimizada: null,
        enderecoOriginal,
        enderecoNormalizado: '',
        logradouro: campos.logradouro || campos.endereco,
        numero: campos.numero,
        complemento: campos.complemento,
        apartamento: campos.apartamento,
        bloco: campos.bloco,
        sala: campos.sala,
        loja: campos.loja,
        bairro: campos.bairro,
        cidade: campos.cidade,
        estado: campos.estado,
        cep: campos.cep,
        observacao: campos.observacao,
        atId: campos.atId,
        sequenceOrigem: campos.sequenceOrigem,
        stopOrigem: campos.stopOrigem,
        spxTn: pacotes[0] || '',
        enderecoFonte: campos.endereco || campos.logradouro || '',
        pacotes,
        quantidadePacotes: pacotes.length,
        quantidadeBipada: 0,
        statusEntrega: 'pendente',
        statusGeocodificacao: coordenadaPlanilhaValida ? 'ok' : 'pendente',
        latitude: coordenadaPlanilhaValida ? latNumero : null,
        longitude: coordenadaPlanilhaValida ? lonNumero : null,
        fonteCoordenada: coordenadaPlanilhaValida ? 'xlsx' : null,
        origem: 'xlsx',
        fonte: {
          arquivo: nomeArquivo || '',
          linha: i + 1,
          perfil: detectarPerfil(headers),
          camposOriginais: Object.fromEntries(headers.map((h, idx) => [String(h || `coluna_${idx + 1}`), row?.[idx] ?? '']))
        }
      };
      paradas.push(parada);
      if (idPlanilha && !porIdExplicito.has(idBase)) porIdExplicito.set(idBase, parada);
    }

    if (!paradas.length) throw new Error('Nenhuma parada válida foi encontrada na planilha. Revise as colunas associadas.');
    return { paradas, erros, headers, columns, headerIndex, perfil: detectarPerfil(headers) };
  }

  function parseCsv(texto) {
    const linhas = [];
    let row = [];
    let campo = '';
    let aspas = false;
    const s = String(texto || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (aspas) {
        if (ch === '"' && s[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') aspas = false;
        else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(campo); campo = ''; }
      else if (ch === '\n') { row.push(campo.replace(/\r$/, '')); linhas.push(row); row = []; campo = ''; }
      else campo += ch;
    }
    if (campo.length || row.length) { row.push(campo.replace(/\r$/, '')); linhas.push(row); }
    return linhas;
  }

  function decodeXml(texto) {
    return String(texto || '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  }

  function attr(texto, nome) {
    const re = new RegExp(`(?:^|\\s)${nome.replace(':', '\\:')}=(?:"([^"]*)"|'([^']*)')`, 'i');
    const m = String(texto || '').match(re);
    return m ? decodeXml(m[1] ?? m[2] ?? '') : '';
  }

  function colunaParaIndice(ref) {
    const letras = String(ref || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
    let n = 0;
    for (const c of letras) n = n * 26 + c.charCodeAt(0) - 64;
    return Math.max(0, n - 1);
  }

  function extrairTextosXml(bloco) {
    const partes = [];
    String(bloco || '').replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi, (_, t) => { partes.push(decodeXml(t)); return _; });
    return partes.join('');
  }

  function parseSharedStrings(xml) {
    const out = [];
    String(xml || '').replace(/<si\b[^>]*>([\s\S]*?)<\/si>/gi, (_, bloco) => { out.push(extrairTextosXml(bloco)); return _; });
    return out;
  }

  function parseWorksheet(xml, sharedStrings) {
    const rows = [];
    String(xml || '').replace(/<row\b[^>]*>([\s\S]*?)<\/row>/gi, (_, blocoRow) => {
      const row = [];
      String(blocoRow).replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi, (_c, attrs, corpo) => {
        const ref = attr(attrs, 'r');
        const index = colunaParaIndice(ref);
        const tipo = attr(attrs, 't').toLowerCase();
        let valor = '';
        if (tipo === 'inlinestr') valor = extrairTextosXml(corpo);
        else {
          const vm = String(corpo).match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
          const bruto = vm ? decodeXml(vm[1]) : '';
          if (tipo === 's') valor = sharedStrings[Number(bruto)] ?? '';
          else if (tipo === 'b') valor = bruto === '1' ? 'TRUE' : 'FALSE';
          else valor = bruto;
        }
        row[index] = valor;
        return _c;
      });
      rows.push(row.map(v => v ?? ''));
      return _;
    });
    return rows;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Este navegador não possui o descompactador necessário para ler XLSX localmente.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function lerZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const inicioBusca = Math.max(0, bytes.length - 0xFFFF - 22);
    for (let i = bytes.length - 22; i >= inicioBusca; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo XLSX inválido: diretório ZIP não encontrado.');
    const total = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const entries = new Map();
    for (let n = 0; n < total; n++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Arquivo XLSX inválido: diretório corrompido.');
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));
      entries.set(name, { method, compressedSize, localOffset });
      offset += 46 + nameLen + extraLen + commentLen;
    }
    async function read(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const lo = entry.localOffset;
      if (view.getUint32(lo, true) !== 0x04034b50) throw new Error('Arquivo XLSX inválido: entrada corrompida.');
      const nameLen = view.getUint16(lo + 26, true);
      const extraLen = view.getUint16(lo + 28, true);
      const start = lo + 30 + nameLen + extraLen;
      const compressed = bytes.slice(start, start + entry.compressedSize);
      let out;
      if (entry.method === 0) out = compressed;
      else if (entry.method === 8) out = await inflateRaw(compressed);
      else throw new Error(`Arquivo XLSX usa compressão não suportada (${entry.method}).`);
      return decoder.decode(out);
    }
    return { read, entries };
  }

  function resolverTarget(base, target) {
    let path = String(target || '').replace(/^\//, '');
    if (path.startsWith('xl/')) return path;
    if (path.startsWith('../')) return path.replace(/^\.\.\//, '');
    return `${base.replace(/\/$/, '')}/${path}`.replace(/\/\.\//g, '/');
  }

  async function lerXlsxNativo(buffer) {
    const zip = await lerZip(buffer);
    const workbookXml = await zip.read('xl/workbook.xml');
    const relsXml = await zip.read('xl/_rels/workbook.xml.rels');
    if (!workbookXml || !relsXml) throw new Error('Arquivo XLSX não possui estrutura de workbook válida.');
    const sheetMatch = workbookXml.match(/<sheet\b([^>]*)\/?\s*>/i);
    if (!sheetMatch) throw new Error('A planilha não possui abas legíveis.');
    const sheetName = attr(sheetMatch[1], 'name') || 'Planilha1';
    const relId = attr(sheetMatch[1], 'r:id');
    if (!relId) throw new Error('Não consegui localizar a primeira aba do XLSX.');
    let target = '';
    String(relsXml).replace(/<Relationship\b([^>]*)\/?\s*>/gi, (_, attrs) => {
      if (attr(attrs, 'Id') === relId) target = attr(attrs, 'Target');
      return _;
    });
    if (!target) throw new Error('Não consegui resolver a primeira aba do XLSX.');
    const sheetPath = resolverTarget('xl', target);
    const sharedXml = await zip.read('xl/sharedStrings.xml');
    const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];
    const sheetXml = await zip.read(sheetPath);
    if (!sheetXml) throw new Error('A primeira aba do XLSX não pôde ser lida.');
    return { matriz: parseWorksheet(sheetXml, sharedStrings), sheetName, engine: 'xlsx-nativo' };
  }

  async function lerComSheetJs(buffer, file) {
    if (!global.XLSX) return null;
    const workbook = global.XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('A planilha não possui abas.');
    const sheet = workbook.Sheets[sheetName];
    const matriz = global.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: false });
    return { matriz, sheetName, engine: `sheetjs-${global.XLSX.version || 'browser'}` };
  }

  async function lerMatrizArquivo(file) {
    if (!file) throw new Error('Arquivo não informado.');
    const nome = String(file.name || '').toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(nome)) throw new Error('Use um arquivo XLSX, XLS ou CSV.');
    const buffer = await file.arrayBuffer();

    if (nome.endsWith('.csv')) {
      const texto = new TextDecoder('utf-8').decode(buffer);
      return { matriz: parseCsv(texto), sheetName: 'CSV', engine: 'csv-nativo' };
    }

    if (nome.endsWith('.xlsx')) {
      try {
        return await lerXlsxNativo(buffer);
      } catch (erroNativo) {
        const viaSheet = await lerComSheetJs(buffer, file);
        if (viaSheet) return viaSheet;
        const erro = new Error(`Não consegui ler o XLSX. ${erroNativo?.message || ''}`.trim());
        erro.cause = erroNativo;
        throw erro;
      }
    }

    const viaSheet = await lerComSheetJs(buffer, file);
    if (viaSheet) return viaSheet;
    throw new Error('O formato XLS antigo precisa da biblioteca SheetJS. Salve a planilha como XLSX e tente novamente.');
  }

  async function inspecionarArquivo(file) {
    const lido = await lerMatrizArquivo(file);
    const cabecalho = detectarCabecalho(lido.matriz);
    if (cabecalho.headerIndex < 0) throw new Error('A planilha não possui dados legíveis.');
    const dataRows = lido.matriz.slice(cabecalho.headerIndex + 1).filter(row => !linhaVazia(row));
    return {
      nomeArquivo: file.name,
      sheetName: lido.sheetName,
      engine: lido.engine,
      matriz: lido.matriz,
      headerIndex: cabecalho.headerIndex,
      headers: cabecalho.headers || [],
      columns: cabecalho.columns || {},
      perfil: detectarPerfil(cabecalho.headers || []),
      totalLinhasDados: dataRows.length,
      amostra: dataRows.slice(0, 4)
    };
  }

  async function lerArquivo(file, opcoes) {
    const inspecao = opcoes?.inspecao || await inspecionarArquivo(file);
    const resultado = converterLinhas(inspecao.matriz, file.name, {
      headerIndex: Number.isInteger(opcoes?.headerIndex) ? opcoes.headerIndex : inspecao.headerIndex,
      columnMapping: opcoes?.columnMapping || null
    });
    resultado.sheetName = inspecao.sheetName;
    resultado.nomeArquivo = file.name;
    resultado.engine = inspecao.engine;
    resultado.perfil = resultado.perfil || inspecao.perfil || 'generico';
    return resultado;
  }

  global.PacoteEMatoImportacaoXLSX = Object.freeze({
    lerArquivo,
    inspecionarArquivo,
    converterLinhas,
    identificarColunas,
    detectarCabecalho,
    montarEndereco,
    camposMapeaveis: CAMPOS_MAPEAVEIS.slice(),
    _teste: Object.freeze({ parseCsv, parseSharedStrings, parseWorksheet, normalizarCabecalho, detectarPerfil })
  });
})(window);
