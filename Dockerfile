FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci && npm --prefix web ci
COPY . .
RUN npm --prefix web run build && npx tsc -p .

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji fontconfig ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/assets ./assets
COPY --from=build /app/data/box-overrides.json /app/data/blocklist.txt ./data/
COPY --from=build /app/web/dist ./web/dist
COPY BUILDLOG.md ROADMAP.md ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/server/index.ts"]
