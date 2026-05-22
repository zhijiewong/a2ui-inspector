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

## Validating session files

`a2ui-validate` checks a `.a2ui-session.jsonl` recording against the A2UI v0.9
session schema, reporting every malformed or schema-invalid line:

```bash
npx a2ui-validate path/to/session.jsonl
```

Exit code `0` = valid, `1` = validation errors found, `2` = usage error or
unreadable file.

## Sharing a session

The **Share** button encodes the current session into a link — no server, no
upload. The whole session is gzip-compressed into the URL fragment, so the data
never leaves the link itself.

Opening a share link replays the session read-only in the inspector (no sidecar
needed). Links are generated against the public build at
`https://zhijiewong.github.io/a2ui-inspector/`.

A share link contains the **full session data, including anything sensitive in
it** — treat it like the recording itself. Sessions larger than 256 KB encoded
cannot be shared as a link; use **Save** to export the `.jsonl` file instead.

> One-time repo setup for maintainers: enable Pages under
> Settings → Pages → Source: **GitHub Actions**. The `Deploy Pages` workflow
> publishes the UI on every push to `main`.

## Status

v1 complete — Phases 1, 2a, 2b, 2c implemented.
