import { getWorkout } from './training-plan.mjs';

const DB_NAME = 'shape-workout';
const DB_VERSION = 2;
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('workouts')) {
        const store = db.createObjectStore('workouts', { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt');
        store.createIndex('workoutId', 'workoutId');
      }
      if (!db.objectStoreNames.contains('measurements')) {
        const store = db.createObjectStore('measurements', { keyPath: 'id' });
        store.createIndex('recordedOn', 'recordedOn', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

async function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getItem(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key));
}

export async function putItem(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).put(value));
}

export async function deleteItem(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).delete(key));
}

export async function getAllWorkouts() {
  const db = await openDatabase();
  const transaction = db.transaction('workouts', 'readonly');
  const result = await requestResult(transaction.objectStore('workouts').getAll());
  return result.map(normalizeWorkout).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

function validRecordedOn(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function positiveDecimal(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : null;
}

export function normalizeMeasurement(value) {
  if (!value || typeof value !== 'object' || !validRecordedOn(value.recordedOn)) return null;
  const weightKg = positiveDecimal(value.weightKg);
  const waistCm = positiveDecimal(value.waistCm);
  if (weightKg === null && waistCm === null) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    recordedOn: value.recordedOn,
    weightKg,
    waistCm,
  };
}

export function normalizeMeasurements(values) {
  if (!Array.isArray(values)) return [];
  const byDate = new Map();
  for (const value of values) {
    const measurement = normalizeMeasurement(value);
    if (measurement) byDate.set(measurement.recordedOn, measurement);
  }
  return [...byDate.values()].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn));
}

export function measurementSummary(values, referenceDate = new Date()) {
  const end = new Date(referenceDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const startOn = formatDate(start);
  const endOn = formatDate(end);
  const measurements = normalizeMeasurements(values);
  const weights = measurements.filter((measurement) => measurement.weightKg !== null && measurement.recordedOn >= startOn && measurement.recordedOn <= endOn);
  const averageWeightKg = weights.length ? weights.reduce((total, measurement) => total + measurement.weightKg, 0) / weights.length : null;
  const latestWaist = measurements.find((measurement) => measurement.waistCm !== null) ?? null;
  return { averageWeightKg, weightEntries: weights.length, latestWaist };
}

export async function getAllMeasurements() {
  const db = await openDatabase();
  const transaction = db.transaction('measurements', 'readonly');
  return normalizeMeasurements(await requestResult(transaction.objectStore('measurements').getAll()));
}

export async function upsertMeasurement(value) {
  const normalized = normalizeMeasurement(value);
  if (!normalized) throw new Error('Informe uma data válida e pelo menos um valor positivo para peso ou cintura.');
  const db = await openDatabase();
  const transaction = db.transaction('measurements', 'readwrite');
  const store = transaction.objectStore('measurements');
  const current = normalized.id ? await requestResult(store.get(normalized.id)) : null;
  const sameDate = await requestResult(store.index('recordedOn').get(normalized.recordedOn));
  const base = sameDate ?? current ?? {};
  const record = {
    id: base.id ?? normalized.id ?? crypto.randomUUID(),
    recordedOn: normalized.recordedOn,
    weightKg: normalized.weightKg ?? base.weightKg ?? null,
    waistCm: normalized.waistCm ?? base.waistCm ?? null,
  };
  if (current && current.id !== record.id) await requestResult(store.delete(current.id));
  await requestResult(store.put(record));
  return record;
}

export async function deleteMeasurement(id) {
  const db = await openDatabase();
  const transaction = db.transaction('measurements', 'readwrite');
  await requestResult(transaction.objectStore('measurements').delete(id));
}

export async function exportBackup() {
  const [settings, rawDraft, workouts, measurements] = await Promise.all([
    getItem('settings', 'app'),
    getItem('drafts', 'active'),
    getAllWorkouts(),
    getAllMeasurements(),
  ]);
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    draft: normalizeDraft(rawDraft),
    workouts,
    measurements,
  };
}

function lastRecordedValue(sets, key) {
  if (!Array.isArray(sets)) return '';
  const match = [...sets].reverse().find((set) => set.completed && set[key] !== '' && set[key] !== undefined && set[key] !== null);
  return match ? match[key] : '';
}

function normalizeExercise(exercise, templateExercise) {
  const legacySets = Array.isArray(exercise.sets) ? exercise.sets : [];
  const base = templateExercise ?? exercise;
  const completed = exercise.completed ?? legacySets.some((set) => set.completed);
  return {
    ...base,
    repsFinal: exercise.repsFinal ?? '',
    weightKg: exercise.weightKg ?? lastRecordedValue(legacySets, 'weight'),
    rirFinal: exercise.rirFinal ?? lastRecordedValue(legacySets, 'rir'),
    completed,
    completedAt: exercise.completedAt ?? lastRecordedValue(legacySets, 'completedAt') ?? null,
  };
}

export function normalizeWorkout(workout) {
  if (!workout || typeof workout !== 'object') return workout;
  const template = getWorkout(workout.workoutId);
  const byId = new Map((template?.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  return {
    ...workout,
    recordVersion: 2,
    exercises: Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise) => normalizeExercise(exercise, byId.get(exercise.id)))
      : [],
  };
}

export function normalizeDraft(draft) {
  if (!draft?.data) return draft ?? null;
  const data = normalizeWorkout(draft.data);
  const template = getWorkout(data.workoutId);
  if (!template) return { ...draft, data };
  const exercisesById = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  return {
    ...draft,
    data: {
      ...data,
      exercises: template.exercises.map((exercise) => normalizeExercise(exercisesById.get(exercise.id) ?? {}, exercise)),
    },
  };
}

export function backupMeasurements(value) {
  return value?.version === 3 ? normalizeMeasurements(value.measurements) : [];
}

function validBackup(value) {
  const validWorkoutList = value && (value.version === 1 || value.version === 2 || value.version === 3) && Array.isArray(value.workouts) &&
    value.workouts.every((workout) => typeof workout.id === 'string' && typeof workout.workoutId === 'string' && Array.isArray(workout.exercises));
  if (!validWorkoutList) return false;
  if (value.version !== 3) return true;
  return Array.isArray(value.measurements) && value.measurements.length === normalizeMeasurements(value.measurements).length;
}

export async function importBackup(backup) {
  if (!validBackup(backup)) throw new Error('Arquivo de backup inválido ou incompatível.');
  const db = await openDatabase();
  const measurements = backupMeasurements(backup);
  const transaction = db.transaction(['settings', 'drafts', 'workouts', 'measurements'], 'readwrite');
  for (const name of ['settings', 'drafts', 'workouts', 'measurements']) transaction.objectStore(name).clear();
  if (backup.settings) transaction.objectStore('settings').put(backup.settings);
  if (backup.draft) transaction.objectStore('drafts').put(normalizeDraft(backup.draft));
  backup.workouts.forEach((workout) => transaction.objectStore('workouts').put(normalizeWorkout(workout)));
  measurements.forEach((measurement) => transaction.objectStore('measurements').put(measurement));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
