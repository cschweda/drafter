// What every harness shares: running one trap at one entry point within its time and memory, and
// comparing what happened with what the manifest says must.
import { expect } from 'vitest';
import { LIMIT_MS, type Outcome, type Trap } from './traps';

/** What an entry point did with a trap. */
export type Happened =
  | { kind: 'opened'; text: string; message: string }
  | { kind: 'refused'; message: string };

export interface Measured<T> {
  value: T;
  ms: number;
  /** The most the heap and array buffers grew while it ran, in bytes (sampled, garbage included). */
  peak: number;
  /** What it left behind once garbage is collected, its result included; null without `gc`. */
  kept: number | null;
}

const used = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers;
};

/** `global.gc`, where the runner exposes it (`--expose-gc`, fixtures/trap/vitest.config.ts). */
const collect = (globalThis as { gc?: () => void }).gc;

/**
 * Runs `work`, timing it and sampling memory every few milliseconds while it awaits. A throw is
 * the test's failure: an entry point must never throw at the person opening a file.
 */
export async function measured<T>(work: () => Promise<T>): Promise<Measured<T>> {
  collect?.();
  const before = used();
  let peak = before;
  const timer = setInterval(() => {
    peak = Math.max(peak, used());
  }, 5);
  const start = performance.now();
  try {
    const value = await work();
    const ms = performance.now() - start;
    peak = Math.max(peak, used());
    let kept: number | null = null;
    if (collect) {
      collect();
      kept = Math.max(0, used() - before);
    }
    return { value, ms, peak: Math.max(0, peak - before), kept };
  } finally {
    clearInterval(timer);
  }
}

/**
 * The memory one trap may keep: its own allowance, else a few copies of its bytes and room for the
 * reader's work.
 */
export const memoryBound = (trap: Trap, size: number) =>
  trap.memoryMB !== undefined ? trap.memoryMB * 1024 * 1024 : 8 * size + 128 * 1024 * 1024;

/** The most any trap may grow the heap while it runs, garbage and all: bounded, whatever it is. */
export const PEAK_BOUND = 3 * 1024 * 1024 * 1024;

/** Checks what happened against the outcome, with the trap's id in every message. */
export function checkOutcome(trap: Trap, outcome: Outcome, happened: Happened, where: string) {
  const label = `${trap.id} at ${where}`;
  if (outcome.kind === 'refused') {
    expect(happened.kind, `${label}: should be refused (${happened.message})`).toBe('refused');
    expect(happened.message, label).toContain(outcome.says);
    return;
  }
  expect(happened.kind, `${label}: should open (${happened.message})`).toBe('opened');
  if (happened.kind !== 'opened') return;
  if (outcome.kind === 'opens-with-warning')
    expect(happened.message, label).toContain(outcome.says);
  else expect(happened.message, `${label}: said something on opening`).toBe('');
  if (outcome.text !== undefined) {
    if (outcome.text.length > 10_000) {
      expect(happened.text.length, label).toBe(outcome.text.length);
      expect(happened.text === outcome.text, label).toBe(true);
    } else expect(happened.text, label).toBe(outcome.text);
  }
  if (outcome.chars !== undefined) expect(happened.text.length, label).toBe(outcome.chars);
  for (const line of outcome.lines ?? []) {
    expect(happened.text.includes(line), `${label}: holds “${line.slice(0, 80)}”`).toBe(true);
  }
}

/** Checks the time and memory a trap took at one entry point. */
export function checkCost(trap: Trap, size: number, cost: Measured<unknown>, where: string) {
  const limit = trap.limitMs ?? LIMIT_MS;
  const label = `${trap.id} at ${where}`;
  expect(cost.ms, `${label} took ${Math.round(cost.ms)} ms`).toBeLessThan(limit);
  expect(cost.peak, `${label} grew memory by ${cost.peak} bytes at its peak`).toBeLessThan(
    PEAK_BOUND,
  );
  // Without `gc`, the peak is all there is to go on.
  const kept = cost.kept ?? cost.peak;
  expect(kept, `${label} kept ${kept} bytes`).toBeLessThan(memoryBound(trap, size));
}
