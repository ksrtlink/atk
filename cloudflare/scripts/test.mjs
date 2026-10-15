// One process also works in restricted Windows environments that disallow test-runner child processes.
await import('../tests/auth.test.mjs');
await import('../tests/worker.test.mjs');
