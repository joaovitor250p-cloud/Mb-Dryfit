/**
 * Interpretador local de português do Assistente MB.
 * Não acessa serviços pagos; não envia textos para uma IA externa.
 * Ações destrutivas só são executadas após confirmação separada na interface.
 */
export type AssistantCommand =
  | {kind:'pay-order'; oc:string}
  | {kind:'find-order'; oc:string}
  | {kind:'delete-sample'; oc:string}
  | {kind:'price-change'; reference:string; amount:number}
  | {kind:'price-lookup'; reference:string}
  | {kind:'workshop-debt'|'workshop-pix'|'workshop-pending'|'workshop-production'; workshop:string}
  | {kind:'workshop-paid-month';workshop:string; month?:string}
  | {kind:'help'}
  | {kind:'unknown'};

const clean = (text:string):string => String(text||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
  .replace(/[“”"']/g,'').replace(/\s+/g,' ').trim();

// Grafias autorizadas pelo cadastro original. Nomes novos também são aceitos
// pela captura após preposições: "do João", "da Oficina X", etc.
const knownWorkshops = [
  'dario medina','dona francisca','theodoro','virgilio','vigilio',
  'rodrigo','ramiro','mauro','jony','vitor'
];

const MONTHS:Record<string,number>={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
function requestedMonth(input:string):string|undefined {
  const word=Object.keys(MONTHS).find(month=>new RegExp(`\\b${month}\\b`).test(input));
  if(!word)return undefined;
  const year=/(?:19|20)\d{2}/.exec(input)?.[0]||String(new Date().getFullYear());
  return `${year}-${String(MONTHS[word]).padStart(2,'0')}`;
}

function workshopFrom(input:string):string {
  for(const name of knownWorkshops){
    const match = new RegExp(`(?:^|[^a-z])${name.replace(/ /g,'\\s+')}(?:$|[^a-z])`);
    if(match.test(input))return name;
  }
  // Permite oficinas adicionadas posteriormente, não só os 9 costureiros iniciais.
  const captured = /\b(?:ao|a|pro|pra|para|do|da|de|costureiro|costureira|oficina)\s+([a-z][a-z0-9\s-]{1,70})/.exec(input)?.[1];
  return (captured||'').replace(/\b(?:este|nesse|no|neste)\s+mes\b.*$/,'')
    .replace(/\b(?:em andamento|pendentes?|nao pagas?|este mes|esse mes|neste mes|agora|hoje|por favor)\b.*$/,'')
    .replace(/[.,?!]+$/,'').trim();
}

export function parseAssistantCommand(voiceOrText:string):AssistantCommand {
  const input=clean(voiceOrText);
  if(!input||/^(ajuda|comandos|exemplos|o que voce faz|o que sabe fazer)\??$/.test(input))return {kind:'help'};
  // Transcrição pode transformar OC em "O C" ou "ordem de corte".
  const oc=/\b(?:oc|o\s+c|ordem\s+de\s+corte)\s*(?:n(?:umero)?\s*)?[#º°.:=-]?\s*(\d{1,9})\b/.exec(input)?.[1];
  const reference=/\b(?:ref|referencia)\s*(?:n(?:umero)?\s*)?[#º°.:=-]?\s*(\d{1,12})\b/.exec(input)?.[1];
  if(oc&&/\b(?:apagar|excluir|deletar|remover)\b/.test(input)&&/\b(?:amostra|amostras)\b/.test(input)){
    return /\b(?:nao|nunca|sem)\b/.test(input)?{kind:'find-order',oc}:{kind:'delete-sample',oc};
  }
  if(oc&&/\b(?:paga|pago|pague|pagar|quitar|quitada|quitado|liquidar|liquidado)\b/.test(input)){
    return /\b(?:nao|nunca|sem)\b/.test(input)?{kind:'find-order',oc}:{kind:'pay-order',oc};
  }
  if(reference&&/\b(?:mudar|alterar|atualizar|modificar|trocar|corrigir)\b/.test(input)){
    // Preço especial por costureiro NÃO equivale ao preço padrão da referência.
    if(/\b(?:mauro|dario|jony|rodrigo|francisca|ramiro|vitor|theodoro|virgilio|vigilio|costureiro|oficina)\b/.test(input))return {kind:'unknown'};
    const raw=/\b(?:para|por|valor|preco)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\b/.exec(input)?.[1];
    const amount=raw?Number(raw.replace(',','.')):NaN;
    if(Number.isFinite(amount)&&amount>0&&amount<=1000000)return {kind:'price-change',reference,amount};
  }
  if(reference)return {kind:'price-lookup',reference};
  if(oc)return {kind:'find-order',oc};

  const workshop=workshopFrom(input);
  if(workshop){
    if(/\b(?:pix|chave pix|chave do pix)\b/.test(input))return {kind:'workshop-pix',workshop};
    if(/\b(?:paguei|pagamos|ja paguei|foi pago|pago)\b/.test(input)&&/\b(?:mes|novembro|outubro|dezembro|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro)\b/.test(input))return {kind:'workshop-paid-month',workshop,month:requestedMonth(input)};
    if(/\b(?:devendo|devo|devemos|divida|falta pagar|a pagar|saldo devedor)\b/.test(input))return {kind:'workshop-debt',workshop};
    if(/\b(?:quantas|quantos|total)\b/.test(input)&&/\b(?:pecas|produzindo|producao|em andamento)\b/.test(input))return {kind:'workshop-production',workshop};
    if(/\b(?:pendentes?|abertas?|falta pagar|em aberto|nao pagas?)\b/.test(input))return {kind:'workshop-pending',workshop};
    if(/\b(?:pagamentos|pago|paguei)\b/.test(input))return {kind:'workshop-paid-month',workshop,month:requestedMonth(input)};
  }
  return {kind:'unknown'};
}

/** Sexta atual ou seguinte; mesma regra do fechamento financeiro. */
export function fridayForDay(now:Date):string {
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  d.setDate(d.getDate()+(5-d.getDay()+7)%7);
  const two=(n:number)=>String(n).padStart(2,'0');
  return `${two(d.getDate())}/${two(d.getMonth()+1)}/${d.getFullYear()}`;
}
