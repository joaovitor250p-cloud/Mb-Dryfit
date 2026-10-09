document.getElementById('btnDiagNovo').onclick=function(){
 const box=document.getElementById('diagNovo');
 const out=document.getElementById('diagTexto');
 box.style.display='block';
 const d=window.diagnosticoRotaReal;
 if(!d){out.textContent='Faça a leitura do PDF primeiro.';return;}
 let t='PACOTES: '+d.totalPacotes+'\nPARADAS: '+d.totalParadas+'\n\n';
 d.paradas.forEach((p,i)=>{t+='PARADA '+(i+1)+'\n'+p.endereco+'\nPacotes: '+p.quantidadePacotes+'\n\n';});
 out.textContent=t;
}
