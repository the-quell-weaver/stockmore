import { track } from "@vercel/analytics";

export function startMark(name: string) {
  performance.mark(`${name}:start`);
}

export function endMark(name: string) {
  performance.mark(`${name}:end`);
  try {
    performance.measure(name, `${name}:start`, `${name}:end`);
    const entries = performance.getEntriesByName(name, "measure");
    if (entries.length > 0) {
      track(name, { duration: Math.round(entries[0].duration) });
    }
  } finally {
    performance.clearMarks(`${name}:start`);
    performance.clearMarks(`${name}:end`);
    performance.clearMeasures(name);
  }
}
