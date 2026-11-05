const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const orders = fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');
const rules = fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

test('a edição da OC lista costureiros conhecidos, cadastrados e registrados nas OCs',()=>{
  assert.match(orders,/\.\.\.TAILORS,\.\.\.workshopOptions\.map\(x=>x\.name\),\.\.\.rows\.map\(x=>x\.office\)/);
  assert.match(orders,/k==='office'\?<select/);
  assert.match(orders,/registeredTailors\.map\(name=>/);
});

test('a REF é pesquisada por tipo de roupa, com exceção de preço do costureiro',()=>{
  assert.match(orders,/normalizedGarmentType\(row\.pieceType\|\|''\)/);
  assert.match(orders,/workshopKey\(w\.name\)===workshopKey\(row\.office\)/);
  assert.match(orders,/special\?\.price\?\?base\?\.price/);
  assert.match(orders,/next\.piecePrice=resolvedReferencePrice\(next,referencePrices,workshopOptions\)/);
});

test('não salva OC nova sem nome, costureiro, OC, REF, quantidade e valor',()=>{
  for (const field of ['nome da peça', 'costureiro', 'OC', 'REF', 'quantidade válida (maior que zero)']) assert.ok(orders.includes(field));
  assert.match(orders,/if\(!editing\)\{/);
  assert.match(orders,/Number\.isFinite\(parsePrice\(row\.piecePrice\)\)/);
});

test('REF desconhecida pode ser cadastrada no editor sem sobrescrever preço existente',()=>{
  assert.match(orders,/VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA/);
  assert.match(orders,/Cadastrar esta REF aqui/);
  assert.match(orders,/await runTransaction\(db,async transaction=>/);
  assert.match(orders,/if\(found\.exists\(\)\)throw/);
  assert.match(orders,/transaction\.set\(referenceDoc,/);
});

test('Firestore libera leitura de preço para editor de OC, mas edição global continua restrita',()=>{
  const section = rules.split('match /reference_prices/{priceId} {')[1].split('match /audit_log/{entryId} {')[0];
  assert.match(section,/allow get, list: if[^;]*canView\('orders'\)/);
  assert.match(section,/allow create: if \(canWrite\('workshops'\) \|\| canWrite\('orders'\)\)/);
  assert.match(section,/allow update: if canWrite\('workshops'\)/);
  assert.match(rules,/\(!\('pieceType' in d\) \|\|/);
});
