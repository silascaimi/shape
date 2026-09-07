import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKOUTS } from '../training-plan.mjs';

const markdown = await readFile(new URL('../../docs/01-treino.md', import.meta.url), 'utf8');

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

console.log('Plano PWA validado: seis sessões, sete exercícios e 15–17 séries por sessão.');
