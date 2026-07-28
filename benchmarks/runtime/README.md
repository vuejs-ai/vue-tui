# Runtime benchmarks

This private workspace contains representative Runtime renderer update workloads. Vitest owns warmup, sampling, statistics, filtering, and failure reporting.

Run them from the repository root with:

```sh
vp run bench
```

Filter a scenario with Vitest's ordinary name filter:

```sh
cd benchmarks/runtime
vp test bench --run -t 'inline transcript'
```

`fixtures/` only mounts stable-size workloads through the official `@vue-tui/testing` host. Runtime correctness, lifecycle, and leak coverage belong in `tests/runtime`; this workspace contains no separate acceptance policy or benchmark-harness test suite.

Benchmarks are not part of `vp run check` because wall-clock measurements depend on the host. `check` still typechecks this workspace.
