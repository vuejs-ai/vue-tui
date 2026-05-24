# vue-tui

Terminal UI framework built on Vue and Vite. Components, layout, focus, HMR, and testing out of the box.

## Packages

- [`@vue-tui/runtime`](./packages/runtime) — Vue terminal renderer.
- [`@vue-tui/testing`](./packages/testing) — test harness for `@vue-tui/runtime`.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## Credits

vue-tui started as a Vue port of [Ink](https://github.com/vadimdemedes/ink), the library that proved terminal UIs could be built with the same component patterns we use on the web. The component model, yoga-based layout, focus system, rendering pipeline — all of it originates in Ink's design, adapted to follow Vue's philosophy and conventions. Thank you to [Vadim Demedes](https://github.com/vadimdemedes), [Sindre Sorhus](https://github.com/sindresorhus), and the [Ink contributors](https://github.com/vadimdemedes/ink/graphs/contributors) for creating such a solid foundation.
