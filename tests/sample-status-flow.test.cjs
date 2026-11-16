const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const ts = require('typescript');
const filename = path.join(root, 'src/lib/sampleStage.ts');
const compiled = ts.transpileModule(read('src/lib/sampleStage.ts'), {
  fileName: filename, reportDiagnostics: true,
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
});
assert.equal(compiled.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error).length, 0);
const moduleObj = {exports: {}};
vm.runInNewContext(compiled.outputText, {module: moduleObj, exports: moduleObj.exports});
const {visibleSampleStage, isAutoDeliveredSample} = moduleObj.exports;

const stamp = (seconds, nanoseconds=0) => ({seconds, nanoseconds});
const legacy = () => ({
  status: 'done', orderId: 'oc_710', createdBy: 'operador', completedBy: 'operador',
  createdAt: stamp(100), completedAt: stamp(100)
});

test('Amostra criada automaticamente pela entrega é Em andamento até confirmação manual', () => {
  assert.equal(isAutoDeliveredSample(legacy()), true);
  assert.equal(visibleSampleStage(legacy()), 'in_progress');
  assert.equal(visibleSampleStage({status:'in_progress',orderId:'oc_711'}), 'in_progress');
});
test('Pronto manual e antigo estado store continuam em Prontos', () => {
  assert.equal(isAutoDeliveredSample({...legacy(), completedAt:stamp(110)}), false);
  assert.equal(visibleSampleStage({...legacy(), completedAt:stamp(110)}), 'done');
  assert.equal(visibleSampleStage({status:'store'}), 'done');
  assert.equal(visibleSampleStage({status:'done', createdAt:stamp(100), completedAt:stamp(100)}), 'done');
  assert.equal(visibleSampleStage({...legacy(),completedAt:stamp(100,10)}), 'done');
});
test('Amostras lista apenas Em andamento e Cortes oferece Todos, Em andamento e Prontos', () => {
  const samples = read('src/SampleWorkflow.tsx');
  assert.match(samples, /view === 'samples'[\s\S]*?visibleSampleStage\(x\) === 'in_progress'/);
  assert.match(samples, /filter === 'all' \|\| visibleSampleStage\(x\) === filter/);
  assert.match(samples, /setFilter\('all'\)/);
  assert.match(samples, /setFilter\('in_progress'\)/);
  assert.match(samples, /setFilter\('done'\)/);
  assert.match(samples, /items\.filter\(isAutoDeliveredSample\)/);
  assert.match(samples, /runTransaction\(db, async transaction/);
  assert.match(samples, /visibleSampleStage\(p\) === status/);
  assert.match(samples, /<span>Cards em andamento<\/span>/);
});
test('Firestore permite nova amostra de OC em andamento e preserva cliente antigo', () => {
  const rules = read('firestore.rules');
  const orders = read('src/CutOrders.tsx');
  assert.match(rules, /request\.resource\.data\.status in \['in_progress', 'done'\]/);
  assert.match(orders, /saveWithSampleStage\('in_progress'\)/);
  assert.match(orders, /saveWithSampleStage\('done'\)/);
});
