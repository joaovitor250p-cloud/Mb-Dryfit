/*
 * Pacote É Mato — compatibilidade de endereços
 *
 * Este arquivo consolida, SEM ALTERAR A LÓGICA, os helpers globais que antes
 * estavam espalhados em arquivos de correção versionados. Os nomes públicos
 * foram mantidos para preservar qualquer uso existente ou diagnóstico manual.
 *
 * IMPORTANTE: o agrupamento efetivo de paradas continua dentro do app.js.
 * Este arquivo não cria um novo agrupamento e não participa do mapa.
 */

/* ===== Preservado de correcao-v13.js ===== */
// ============================================================
// V13 - CHAVE REAL DE PARADA
// Corrige agrupamento antes da criação das paradas
// Regra: LOGRADOURO + NUMERO
// ============================================================

function criarChaveParadaCorreta(endereco){

    if(!endereco) return "";

    let e = String(endereco)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-z0-9 ]/g," ")
        .replace(/\s+/g," ")
        .trim();


    // abreviações comuns encontradas nos PDFs
    e = e
      .replace(/\bmq\b/g," marques ")
      .replace(/\bmarquesvalenca\b/g," marques valenca ")
      .replace(/\bcnsolafaiette\b/g," conselheiro lafaiette ")
      .replace(/\bfrgaspar\b/g," frei gaspar ");


    // remove complementos antes do número
    e = e.replace(
      /(apto|apartamento|ap|bloco|bl|torre|sala|casa|fundos|lado|t[0-9]).*?(?=[0-9])/g,
      " "
    );


    // captura número do imóvel no final
    let numero = "";

    let numeros = e.match(/\b\d+\b/g);

    if(numeros && numeros.length){
        numero = numeros[numeros.length-1];
    }


    // remove números de apartamento e mantém apenas rua
    let rua = e
      .replace(/\b\d+\b/g," ")
      .replace(/\s+/g," ")
      .trim();


    return (
      rua
      .replace(/\s/g,"")
      +
      "_"
      +
      numero
    );

}


// disponibiliza para o agrupador usar
window.criarChaveParadaCorreta = criarChaveParadaCorreta;

/* ===== Preservado de correcao-v14.js ===== */
// ============================================================
// V14 - PARSER DE ENDEREÇO REAL
// Extrai rua + número antes do agrupamento
// ============================================================

function extrairEnderecoReal(texto){

    if(!texto) return "";

    let e = String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .replace(/[_-]/g," ")
        .replace(/\s+/g," ")
        .trim();


    // abreviações comuns
    const mapa = {
        "mq":"marques",
        "cnsol":"conselheiro",
        "fr":"frei",
        "frgaspar":"frei gaspar",
        "r ":"rua ",
        "av ":"avenida "
    };

    Object.keys(mapa).forEach(k=>{
        e=e.replace(new RegExp("^"+k+"\\b"), mapa[k]);
    });


    // remove cidade
    e=e.replace(/saopaulo/g," ");


    // separa o número do imóvel (último número)
    let numeros=e.match(/\d+/g);
    let numero="";

    if(numeros && numeros.length){
        numero=numeros[numeros.length-1];
    }


    // remove complementos
    e=e.replace(
      /(apto|apartamento|ap|bloco|torre|sala|casa|fundos|lado|bl)\w*/g,
      " "
    );


    e=e.replace(/\d+/g," ")
        .replace(/\s+/g," ")
        .trim();


    return e.replace(/\s/g,"")+"_"+numero;
}


window.extrairEnderecoReal = extrairEnderecoReal;

/* ===== Preservado de correcao-v18.js ===== */
/*
 V18 - AGRUPAMENTO INTELIGENTE DE RUAS
 Melhora abreviações e pequenas diferenças de leitura do Circuit.
 Mantém número do imóvel como regra obrigatória.
*/

(function(){

window.ruasParecidasV18 = function(a,b){

 if(!a || !b) return false;

 let normalizar = s => String(s)
   .toLowerCase()
   .normalize("NFD")
   .replace(/[\u0300-\u036f]/g,"")
   .replace(/[^a-z0-9]/g,"");

 let x = normalizar(a);
 let y = normalizar(b);

 const troca = [
   ["mq","marques"],
   ["cnsol","conselheiro"],
   ["frgaspar","freigaspar"],
   ["sapucai","sapucaia"],
   ["taquary","taquari"]
 ];

 troca.forEach(([a,b])=>{
   if(x.startsWith(a)) x=b+x.slice(a.length);
   if(y.startsWith(a)) y=b+y.slice(a.length);
 });

 if(x===y) return true;

 let maior = Math.max(x.length,y.length);
 let menor = Math.min(x.length,y.length);

 return menor >= 6 && (x.includes(y) || y.includes(x)) && (menor/maior)>0.75;
};

})();

/* ===== Preservado de correcao-v20.js ===== */
/*
 V20 - CORREÇÃO ESPECÍFICA DE LOGRADOUROS
 Ajusta abreviações identificadas no diagnóstico.
*/

(function(){

window.normalizarRuaV20 = function(rua){

    if(!rua) return "";

    let r = String(rua)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]/g,"");

    const regras = {
        "cnsolafaiette":"conselheirolafaiette",
        "cnsolafayette":"conselheirolafaiette",
        "mqvalenca":"marquesvalenca",
        "frgaspar":"freigaspar"
    };

    Object.keys(regras).forEach(k=>{
        if(r.startsWith(k)){
            r = regras[k] + r.slice(k.length);
        }
    });

    return r;
};

})();

/* ===== Preservado de correcao-v26.js ===== */
/*
 V26 - LIMPEZA DO ENDEREÇO BRUTO
 Remove sufixos internos do Circuit antes da criação da parada.
*/

(function(){

window.limparEnderecoBrutoV26 = function(valor){

    if(!valor) return "";

    return String(valor)
      .replace(/_s\d+/gi,"")
      .replace(/_x\d+/gi,"")
      .replace(/_s[a-z0-9]+/gi,"")
      .replace(/_x[a-z0-9]+/gi,"")
      .trim();
};

})();

/* ===== Preservado de correcao-v32.js ===== */
/*
 V32 - Base v27 + correção exclusiva de código interno Circuit

 Mantém a contagem original da v27.
 Corrige somente duplicidades causadas por sufixos:
 _s101, _s102, etc.
 Não faz agrupamento geral por rua/número.
*/

window.removerCodigoCircuitV32 = function(valor){
    if(!valor) return "";
    return String(valor)
      .replace(/_s\d+/gi,"")
      .replace(/_x\d+/gi,"")
      .trim();
};
