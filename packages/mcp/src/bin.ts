#!/usr/bin/env node
// The program's entry: the server in the main thread, and the reader when the server starts this
// same file as its worker.
import { isMainThread } from 'node:worker_threads';
import { main } from './main';
import { runWorker } from './worker';

if (isMainThread) {
  main(
    process.argv.slice(2),
    { err: (line) => console.error(line) },
    {
      url: new URL(import.meta.url),
      execArgv: [],
    },
  ).then((code) => {
    process.exitCode = code;
  });
} else {
  runWorker();
}
