import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createWriter } from '../app/storage/writer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createWriter', () => {
  test('writes once, 750 ms after the last change', async () => {
    const write = vi.fn(async (_: string) => {});
    const writer = createWriter(write);
    writer.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    writer.schedule('ab');
    await vi.advanceTimersByTimeAsync(700);
    expect(write).not.toHaveBeenCalled();
    expect(writer.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(60);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('ab');
    expect(writer.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('writes at least every 5 seconds during continuous typing', async () => {
    const write = vi.fn(async (_: string) => {});
    const writer = createWriter(write);
    for (let i = 0; i < 24; i++) {
      writer.schedule(`text ${i}`);
      await vi.advanceTimersByTimeAsync(500);
    }
    // 12 s of typing with a pause no longer than 500 ms: writes at 5 s and 10 s.
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0]?.[0]).toBe('text 9');
    expect(write.mock.calls[1]?.[0]).toBe('text 19');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenLastCalledWith('text 23');
  });

  test("flush writes what's pending at once", async () => {
    const write = vi.fn(async (_: string) => {});
    const writer = createWriter(write);
    writer.schedule('draft');
    await writer.flush();
    expect(write).toHaveBeenCalledWith('draft');
    expect(writer.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('flush with nothing pending writes nothing, and waits for a write in flight', async () => {
    let finish: () => void = () => {};
    const write = vi.fn(
      (_: string) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const writer = createWriter(write);
    await writer.flush();
    expect(write).not.toHaveBeenCalled();
    writer.schedule('x');
    await vi.advanceTimersByTimeAsync(800);
    let flushed = false;
    const flushing = writer.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);
    finish();
    await flushing;
    expect(flushed).toBe(true);
  });

  test('never runs two writes at the same time', async () => {
    const running: string[] = [];
    let overlap = false;
    const finishers: Array<() => void> = [];
    const write = vi.fn((source: string) => {
      if (running.length > 0) overlap = true;
      running.push(source);
      return new Promise<void>((resolve) => {
        finishers.push(() => {
          running.splice(running.indexOf(source), 1);
          resolve();
        });
      });
    });
    const writer = createWriter(write);
    writer.schedule('one');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    // The first write is slow; a second change comes due meanwhile.
    writer.schedule('two');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writer.pending).toBe(true);
    finishers[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('two');
    finishers[1]?.();
    await writer.flush();
    expect(overlap).toBe(false);
    expect(writer.pending).toBe(false);
  });

  test('a failed write rejects flush, keeps the text pending, and does not stop later writes', async () => {
    const write = vi
      .fn<(source: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValue(undefined);
    const writer = createWriter(write);
    writer.schedule('keep me');
    await expect(writer.flush()).rejects.toThrow('quota');
    expect(writer.pending).toBe(true);
    await writer.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('keep me');
    expect(writer.pending).toBe(false);
  });

  test('a failed timed write does not leave an unhandled rejection', async () => {
    const write = vi.fn().mockRejectedValue(new Error('blocked'));
    const writer = createWriter(write);
    writer.schedule('x');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writer.pending).toBe(true);
  });

  test('honors delay and maxWait options', async () => {
    const write = vi.fn(async (_: string) => {});
    const writer = createWriter(write, { delay: 100, maxWait: 250 });
    writer.schedule('a');
    await vi.advanceTimersByTimeAsync(110);
    expect(write).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i++) {
      writer.schedule(`b${i}`);
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
