import { buildReplaySummary } from "./index.js";

export function serializeRunRecord({ id, label, run, createdAt = new Date().toISOString() }) {
  return { id, label, createdAt, summary: buildReplaySummary(run) };
}

export function createRunStore({ storage = globalThis.localStorage, key = "economic-simulator:runs" } = {}) {
  if (!storage) throw new Error("createRunStore requires a storage object");

  const readAll = () => JSON.parse(storage.getItem(key) ?? "[]");
  const writeAll = (records) => storage.setItem(key, JSON.stringify(records));

  return {
    save(record) {
      const records = readAll().filter((existing) => existing.id !== record.id);
      records.unshift(record);
      writeAll(records);
    },
    list() {
      return readAll();
    },
    load(id) {
      return readAll().find((record) => record.id === id) ?? null;
    },
    remove(id) {
      writeAll(readAll().filter((record) => record.id !== id));
    },
  };
}
