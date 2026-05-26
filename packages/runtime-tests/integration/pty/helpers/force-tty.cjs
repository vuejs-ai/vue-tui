// Preload script: make stdout/stderr look like TTY for child_process.spawn
// This allows subprocess fixture tests to run without node-pty.
Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true });
Object.defineProperty(process.stderr, "isTTY", { value: true, writable: true });
if (!process.stdout.columns) process.stdout.columns = 100;
if (!process.stdout.rows) process.stdout.rows = 24;
