/*
 * Pacote É Mato — diagnóstico de rota
 *
 * Consolidação dos diagnósticos passivos existentes. Nenhuma destas rotinas
 * altera pacotes, paradas, agrupamento ou bipagem.
 */

/* ===== Preservado de diagnostico-v5.js ===== */
// Validação universal de rota adicionada
window.PEMATO_DIAGNOSTICO = {
  ativo: true,
  resumo: function(pacotes, paradas){
    return {
      pacotesLidos: Array.isArray(pacotes)?pacotes.length:0,
      paradasGeradas: Array.isArray(paradas)?paradas.length:0,
      multiplas: Array.isArray(paradas)?paradas.filter(p=> (p.pacotes||[]).length>=2).length:0
    };
  }
};

/* ===== Preservado de diagnostico-v6.js ===== */
// ============================================================
// DIAGNÓSTICO DE AGRUPAMENTO DE PARADAS - V6
// Mostra no console e tenta identificar endereços próximos
// ============================================================

function diagnosticoParadas(listaParadas){

    console.clear();

    console.log("===== PACOTE É MATO DIAGNÓSTICO =====");

    console.log("Total de paradas:", listaParadas.length);

    let multiplas = listaParadas.filter(
        p => (p.pacotes || []).length >= 2
    );

    console.log("Paradas múltiplas:", multiplas.length);


    console.log("===== PARADAS COM MÚLTIPLOS PACOTES =====");

    multiplas.forEach((p,i)=>{

        console.log(
            `${i+1} - ${p.endereco} | Pacotes: ${p.pacotes.length}`,
            p.pacotes
        );

    });


    console.log("===== FIM DIAGNÓSTICO =====");

    return listaParadas;
}


// Guarda uma cópia para inspeção sem alterar a rota
window.exportarDiagnosticoParadas = function(){

    if(window.paradas){

        console.table(
            window.paradas.map(p=>({
                endereco:p.endereco,
                pacotes:(p.pacotes||[]).length
            }))
        );

    }else{

        console.log("Lista de paradas ainda não encontrada.");

    }
};

/* ===== Preservado de diagnostico-v9.js ===== */
/*
============================================================
PACOTE É MATO V9
DIAGNÓSTICO INTEGRADO NO PROCESSAMENTO
============================================================

Este módulo tenta registrar os dados reais usados pelo app
durante a criação da rota.
*/

window.registroDiagnosticoRota = {
    pacotes: [],
    paradas: [],
    data: null
};


function salvarDiagnosticoRota(pacotes, paradas){

    window.registroDiagnosticoRota = {
        pacotes: pacotes || [],
        paradas: paradas || [],
        data: new Date().toLocaleString()
    };

    console.log(
        "DIAGNÓSTICO ROTA",
        window.registroDiagnosticoRota
    );
}


window.abrirDiagnosticoIntegrado = function(){

    const d = window.registroDiagnosticoRota;

    let html = `
    <h2>Diagnóstico Integrado</h2>
    <p><b>Pacotes:</b> ${d.pacotes.length}</p>
    <p><b>Paradas:</b> ${d.paradas.length}</p>
    <p><b>Data:</b> ${d.data || ""}</p>
    <hr>
    `;

    d.paradas.forEach((p,i)=>{

        html += `
        <div style="padding:10px;border-bottom:1px solid #444">
        <b>Parada ${i+1}</b><br>
        Endereço:
        ${p.endereco || p.address || "NÃO IDENTIFICADO"}
        <br>
        Pacotes:
        ${(p.pacotes || []).length}
        </div>
        `;

    });

    const janela = window.open(
        "",
        "diagnostico",
        "width=600,height=800"
    );

    janela.document.body.innerHTML = html;
};

/* ===== Preservado de diagnostico-v19.js ===== */
/*
 V19 - DIAGNÓSTICO DE AGRUPAMENTO
 Não altera a contagem.
 Mostra como cada parada foi interpretada.
*/

(function(){

window.mostrarDiagnosticoAgrupamentoV19 = function(lista){

    if(!Array.isArray(lista)){
        console.log("V19: lista de paradas não encontrada");
        return;
    }

    const resultado = lista.map((p,i)=>({
        parada: i+1,
        rua: p.ruaCanonica || p.rua || p.endereco || "",
        numero: p.numero || "",
        chave: p.chave || "",
        pacotes: Array.isArray(p.pacotes) ? p.pacotes.length : 0
    }));

    console.table(resultado);
    console.log("DIAGNÓSTICO V19", resultado);
};

})();
