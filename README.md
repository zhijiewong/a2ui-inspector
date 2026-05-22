# A2UI Inspector

Cross-renderer browser-based debugger for A2UI v0.9 message streams.

```bash
npx a2ui-inspector
```

See `docs/superpowers/specs/2026-05-21-a2ui-inspector-design.md` for the design.

## Development

```bash
pnpm install
pnpm test
pnpm dev
```

## Docker

Build and run the inspector in a container:

```bash
docker build -t a2ui-inspector .
docker run --rm -p 8765:8765 a2ui-inspector
```

Then open http://localhost:8765. The container binds the sidecar to `0.0.0.0`
so it is reachable via the published port.

## Status

Phase 1 MVP — in development.
