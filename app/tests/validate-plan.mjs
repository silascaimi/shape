import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKOUTS } from '../training-plan.mjs';
import { normalizeWorkout } from '../db.mjs';
import { isGoogleConfigured, selectBackupsForDeletion } from '../google-drive.mjs';

const markdown = await readFile(new URL('../../docs/01-treino.md', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');

assert.equal(WORKOUTS.length, 6, 'O app deve ter seis sessões.');
for (const workout of WORKOUTS) {
  assert.equal(workout.exercises.length, 7, `${workout.name} deve ter sete exercícios.`);
  const workSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  assert.ok(workSets >= 15 && workSets <= 17, `${workout.name} deve ter 15–17 séries.`);

  const heading = `## ${workout.name}`;
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `${workout.name} não foi encontrado no Markdown.`);
  const end = markdown.indexOf('\n## ', start + heading.length);
  const section = markdown.slice(start, end === -1 ? undefined : end);
  const namesInMarkdown = [...section.matchAll(/^\| (?!Exercício|---)([^|]+)\|/gm)].map((match) => match[1].trim());
  assert.deepEqual(workout.exercises.map((exercise) => exercise.name), namesInMarkdown, `${workout.name} diverge do Markdown.`);
}

assert.match(appSource, /weightKg/);
assert.match(appSource, /repsFinal/);
assert.match(appSource, /rirFinal/);
assert.match(appSource, /Exercícios concluídos/);
assert.match(appSource, /icon-button/);
assert.doesNotMatch(appSource, /createSeries|data-series-index|Série extra|data-rest(?=[\s=>])|beginRest|timerId/);

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

const remoteVersions = Array.from({ length: 32 }, (_, index) => ({
  id: `backup-${index}`,
  modifiedTime: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));
assert.equal(selectBackupsForDeletion(remoteVersions).length, 2);
assert.deepEqual(selectBackupsForDeletion(remoteVersions).map((file) => file.id), ['backup-1', 'backup-0']);
assert.equal(isGoogleConfigured(), true, 'O Client ID público do Google deve estar configurado.');

console.log('Plano PWA validado: treino, registro único, migração e retenção de backup Google.');
