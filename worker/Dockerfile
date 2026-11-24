FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY worker/package.json worker/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY worker worker
COPY tsconfig.json tsconfig.json
COPY tsconfig.app.json tsconfig.app.json
COPY tsconfig.node.json tsconfig.node.json

RUN npm run build -w @prospectra/shared && npm run build -w @prospectra/worker \
  && npm prune --omit=dev

ENV NODE_ENV=production
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/worker
CMD ["node", "dist/index.js"]
