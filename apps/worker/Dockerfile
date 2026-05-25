FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY apps ./apps
COPY schemas ./schemas
RUN npx tsc -p apps/worker/tsconfig.json

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY schemas ./schemas

ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV HYPERFRAMES_COMMAND="npx hyperframes"
ENV CONTENT_OPS_WORKER_WORKSPACE_ROOT=/tmp/content-ops-worker

CMD ["node", "apps/worker/dist/src/index.js"]
