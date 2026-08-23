const assert = require('assert');

const bag = new Map();
global.localStorage = {
  getItem: key => bag.has(key) ? bag.get(key) : null,
  setItem: (key, value) => bag.set(key, String(value)),
  removeItem: key => bag.delete(key)
};
global.window = global;

require('../js/profile-store.js');
const PatientModel = require('../js/patient-model.js');
require('../js/patient-memory.js');

function reset() { bag.clear(); }

reset();
PatientModel.observe('На работе аврал, весь день на нервах.', { responseLatencyMs: 29000 });
assert.strictEqual(ProfileStore.getHistory('portrait', 'state_acute_stress').length, 1);
assert.strictEqual(ProfileStore.get('portrait', 'delivery_signals').response_latency_seconds, 29);
assert.deepStrictEqual(PatientModel.stableStates(), [], 'одиночное состояние не должно стать паттерном');
PatientModel.observe('Снова дедлайн на работе, опять на нервах.', { responseLatencyMs: 17000 });
assert.ok(ProfileStore.get('portrait', 'delivery_signals').response_length_jump > 0);
const states = PatientModel.stableStates();
assert.strictEqual(states[0].state, 'acute_stress');
assert.strictEqual(states[0].valence, 'negative');
assert.strictEqual(states[0].frequency, 2);
assert.match(PatientModel.inject('Сахар сейчас 6'), /ПОВТОРЯЮЩИЕСЯ СОСТОЯНИЯ/);

reset();
const disclosure = 'Состояние целостности, которое даёт дисциплина, я не отдам ни при каких обстоятельствах.';
PatientModel.observe(disclosure);
assert.strictEqual(PatientModel.disclosures()[0].quote, disclosure);
assert.match(PatientModel.inject('Прошло девять дней.'), /САМОРАСКРЫТИЯ — долговременные улики/);
assert.match(PatientModel.inject('Прошло девять дней.'), /не отдам ни при каких обстоятельствах/);

reset();
PatientModel.observe('Работа меня вымотала, этот проект уже бесит.');
PatientModel.observe('Работа снова вымотала, проект тяжело тянуть.');
const door = PatientModel.liveTopic();
assert.strictEqual(door.topic, 'work');
assert.strictEqual(door.valence, 'negative');
assert.match(PatientModel.inject('Сегодня спокойно.'), /знак=negative/);
assert.match(PatientModel.inject('Сегодня спокойно.'), /может быть рана/);

const signals = PatientModel.passiveRead('Возможно... точнее, я не уверен.').signals;
assert.ok(Object.hasOwn(signals, 'response_length_words'));
assert.ok(Object.hasOwn(signals, 'self_correction'));
assert.ok(Object.hasOwn(signals, 'punctuation_break'));
assert.ok(!Object.hasOwn(signals, 'wc'), 'старое имя сигнала не должно протечь');

reset();
PatientMemory.save({ disclosures: { core_motive: disclosure } });
const formatted = PatientMemory.format();
assert.match(formatted, /Ключевые самораскрытия/);
assert.match(formatted, /Перед фразой «не знаю \/ ты не говорил»/);

console.log('patient-model-memory: ok');
