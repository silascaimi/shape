import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKOUTS, findLastExercise, getWorkout } from '../training-plan.mjs';
import { normalizeDraft, normalizeWorkout } from '../db.mjs';
import { isGoogleConfigured, selectBackupsForDeletion } from '../google-drive.mjs';

const markdown = await readFile(new URL('../../docs/01-treino.md', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

assert.equal(WORKOUTS.length, 6, 'O app deve ter seis sessões.');
for (const workout of WORKOUTS) {
  const workSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  if (workout.id === 'pull-b') {
    assert.equal(workout.exercises.length, 8, 'Pull B deve ter oito exercícios.');
    assert.equal(workSets, 19, 'Pull B deve ter 19 séries.');
  } else {
    assert.equal(workout.exercises.length, 7, `${workout.name} deve ter sete exercícios.`);
    assert.ok(workSets >= 15 && workSets <= 17, `${workout.name} deve ter 15–17 séries.`);
  }

  const heading = `## ${workout.name}`;
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `${workout.name} não foi encontrado no Markdown.`);
  const end = markdown.indexOf('\n## ', start + heading.length);
  const section = markdown.slice(start, end === -1 ? undefined : end);
  const rowsInMarkdown = [...section.matchAll(/^\| (?!Exercício|---)(.+?) \|$/gm)]
    .map((match) => match[1].split('|').map((cell) => cell.trim()));
  assert.deepEqual(workout.exercises.map((exercise) => exercise.name), rowsInMarkdown.map((row) => row[0]), `${workout.name} diverge do Markdown.`);
  assert.deepEqual(workout.exercises.map((exercise) => exercise.substitute), rowsInMarkdown.map((row) => row.at(-1)), `${workout.name} tem substitutos divergentes do Markdown.`);
}

const expectedIndependentSubstitutes = new Map([
  ['puxada-frontal', 'Barra fixa pronada, assistida se necessário'],
  ['puxada-triangulo', 'Barra fixa supinada, assistida se necessário'],
  ['triceps-v', 'Tríceps francês com halter'],
  ['triceps-frances-cabo', 'Tríceps testa com barra W e banco'],
  ['triceps-testa', 'Tríceps francês com halter'],
  ['triceps-corda', 'Tríceps testa com barra W e banco'],
  ['crossover-cabo', 'Crucifixo com halteres leve'],
  ['encolhimento-halteres', 'Encolhimento no smith'],
  ['rosca-inversa', 'Rosca inversa com barra W'],
  ['mesa-flexora', 'Cadeira flexora'],
  ['coice-gluteo-maquina', 'Extensão de quadril em quatro apoios com caneleira'],
  ['extensao-lombar-45', 'Ponte de glúteos no chão com halter'],
]);
for (const [id, substitute] of expectedIndependentSubstitutes) {
  const exercise = WORKOUTS.flatMap((workout) => workout.exercises).find((item) => item.id === id);
  assert.equal(exercise?.substitute, substitute, `${id} deve usar uma substituição com recurso independente.`);
}

const historyIdsByName = new Map();
for (const exercise of WORKOUTS.flatMap((workout) => workout.exercises)) {
  if (!historyIdsByName.has(exercise.name)) historyIdsByName.set(exercise.name, new Set());
  historyIdsByName.get(exercise.name).add(exercise.historyId);
}
for (const [name, historyIds] of historyIdsByName) {
  const occurrences = WORKOUTS.flatMap((workout) => workout.exercises).filter((exercise) => exercise.name === name).length;
  if (occurrences > 1) assert.equal(historyIds.size, 1, `${name} deve usar uma única chave de histórico.`);
}

assert.match(appSource, /weightKg/);
assert.match(appSource, /repsFinal/);
assert.match(appSource, /rirFinal/);
assert.match(appSource, /Exercícios concluídos/);
assert.match(appSource, /workout-actions-toggle/);
assert.match(appSource, /workout-action-menu/);
assert.doesNotMatch(appSource, /icon-button/);
assert.doesNotMatch(appSource, /createSeries|data-series-index|Série extra|data-rest(?=[\s=>])|beginRest|timerId/);
assert.match(indexSource, /class="nav-icon"/);
assert.match(styleSource, /\.bottom-nav \{[^}]*border-radius: 22px/s);

const legsA = WORKOUTS.find((workout) => workout.id === 'legs-a');
assert.ok(legsA.exercises.some((exercise) => exercise.id === 'cadeira-abdutora'));
assert.ok(!legsA.exercises.some((exercise) => exercise.id === 'prancha'));

const legacy = normalizeWorkout({
  id: 'legacy', workoutId: 'push-a', workoutName: 'Push A', startedAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-01T11:00:00.000Z',
  exercises: [{ id: 'supino-inclinado-maquina', sets: [
    { weight: '40', rir: '3', completed: true, completedAt: '2026-01-01T10:10:00.000Z' },
    { weight: '45', rir: '2', completed: true, completedAt: '2026-01-01T10:14:00.000Z' },
  ] }],
});
assert.equal(legacy.recordVersion, 2);
assert.equal(legacy.exercises[0].weightKg, '45');
assert.equal(legacy.exercises[0].repsFinal, '');
assert.equal(legacy.exercises[0].rirFinal, '2');
assert.equal(legacy.exercises[0].completed, true);

const current = normalizeWorkout({
  id: 'current', workoutId: 'push-a', workoutName: 'Push A', startedAt: '2026-09-10T10:00:00.000Z', completedAt: '2026-09-10T11:00:00.000Z',
  exercises: [{ id: 'supino-inclinado-maquina', repsFinal: '10', weightKg: '45', rirFinal: '2', completed: true }],
});
assert.equal(current.exercises[0].repsFinal, '10');

const legsAHistory = normalizeWorkout({
  id: 'legs-a-history', workoutId: 'legs-a', workoutName: 'Legs A', startedAt: '2026-09-01T10:00:00.000Z', completedAt: '2026-09-01T11:00:00.000Z',
  exercises: [{ id: 'romeno-halter-a', repsFinal: '10', weightKg: '42', rirFinal: '2', completed: true }],
});
const legsBHistory = normalizeWorkout({
  id: 'legs-b-history', workoutId: 'legs-b', workoutName: 'Legs B', startedAt: '2026-09-10T10:00:00.000Z', completedAt: '2026-09-10T11:00:00.000Z',
  exercises: [{ id: 'romeno-halter-b', repsFinal: '8', weightKg: '46', rirFinal: '1', completed: true }],
});
const legsBDeadlift = getWorkout('legs-b').exercises.find((exercise) => exercise.id === 'romeno-halter-b');
assert.equal(legsAHistory.exercises[0].historyId, 'romeno-halteres', 'Registros antigos recebem a chave de histórico do template.');
assert.equal(legsBDeadlift.historyId, 'romeno-halteres');
assert.equal(findLastExercise([legsAHistory], legsBDeadlift), legsAHistory.exercises[0], 'Legs B deve localizar o registro de Legs A.');
assert.equal(findLastExercise([legsBHistory, legsAHistory], legsBDeadlift), legsBHistory.exercises[0], 'O registro mais recente deve ter prioridade.');

const incompleteMatchingWorkout = normalizeWorkout({
  id: 'incomplete-legs-a', workoutId: 'legs-a', workoutName: 'Legs A', startedAt: '2026-09-11T10:00:00.000Z', completedAt: '2026-09-11T11:00:00.000Z',
  exercises: [{ id: 'romeno-halter-a', repsFinal: '12', weightKg: '50', rirFinal: '2', completed: false }],
});
assert.equal(findLastExercise([incompleteMatchingWorkout, legsAHistory], legsBDeadlift), legsAHistory.exercises[0], 'Exercícios não concluídos não devem ser usados como histórico.');
assert.equal(findLastExercise([legsAHistory], getWorkout('legs-b').exercises.find((exercise) => exercise.id === 'leg-press-unilateral')), null, 'Movimentos diferentes não devem compartilhar histórico.');

const legacyDraft = normalizeDraft({
  key: 'active',
  data: {
    id: 'legacy-draft', workoutId: 'legs-a', workoutName: 'Legs A', startedAt: '2026-09-10T10:00:00.000Z', completedAt: null,
    exercises: [{ id: 'prancha', repsFinal: '45', weightKg: '', rirFinal: '', completed: false }],
  },
});
assert.ok(legacyDraft.data.exercises.some((exercise) => exercise.id === 'cadeira-abdutora'));
assert.ok(!legacyDraft.data.exercises.some((exercise) => exercise.id === 'prancha'));
assert.equal(legacyDraft.data.exercises.find((exercise) => exercise.id === 'cadeira-abdutora').historyId, 'cadeira-abdutora', 'Rascunhos antigos recebem a chave de histórico do template.');

const remoteVersions = Array.from({ length: 32 }, (_, index) => ({
  id: `backup-${index}`,
  modifiedTime: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));
assert.equal(selectBackupsForDeletion(remoteVersions).length, 25);
assert.deepEqual(selectBackupsForDeletion(remoteVersions).map((file) => file.id), Array.from({ length: 25 }, (_, index) => `backup-${24 - index}`));
assert.equal(isGoogleConfigured(), true, 'O Client ID público do Google deve estar configurado.');

console.log('Plano PWA validado: treino, registro único, migração e retenção de backup Google.');
