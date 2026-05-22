# --- build stage -----------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

# --- runtime stage ---------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app

# Bind to all interfaces so the inspector is reachable from outside the container.
ENV A2UI_INSPECTOR_HOST=0.0.0.0
ENV A2UI_INSPECTOR_PORT=8765
EXPOSE 8765

CMD ["node", "packages/sidecar/dist/bin.js"]
