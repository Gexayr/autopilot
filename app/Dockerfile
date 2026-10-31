# Build context: the repo root (see docker-compose.yml) — the image holds the API and the built web app.
ARG BASE_IMAGE=node:22-slim
FROM ${BASE_IMAGE} AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
RUN npm run build

FROM ${BASE_IMAGE} AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm install --no-audit --no-fund
COPY app/ .
RUN npm run build && npm prune --omit=dev

FROM ${BASE_IMAGE} AS prod
# ffmpeg renders Reels; Noto covers Latin, Cyrillic and Armenian for quote images
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# PixVerse CLI for the generator container (spends the accounts' own credits, see src/media.providers.ts)
RUN npm install -g --no-audit --no-fund pixverse@1.4.16
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web /web/dist ./web
# sample AI background for the style preview
COPY app/assets ./assets
COPY app/package*.json ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx typeorm migration:run -d dist/data-source.js && node dist/main.js"]
