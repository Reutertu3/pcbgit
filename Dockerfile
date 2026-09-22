# syntax=docker/dockerfile:1

# ---- build: compile the SvelteKit app ---------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: KiCad image supplies kicad-cli; we add Node and git -----------
# The "-full" variant ships the 3D models the assembled render needs.
# Override with --build-arg KICAD_IMAGE=kicad/kicad:9.0 for a smaller image
# (the 3D view then shows bare boards without components).
ARG KICAD_IMAGE=kicad/kicad:9.0-full
FROM ${KICAD_IMAGE}

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 pcbhub

# Both stages are Debian Bookworm, so the Node binary runs as-is.
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=build --chown=pcbhub /app/build ./build
COPY --from=build --chown=pcbhub /app/node_modules ./node_modules
COPY --from=build --chown=pcbhub /app/package.json ./package.json
COPY --from=build --chown=pcbhub /app/scripts ./scripts
COPY --from=build --chown=pcbhub /app/tests/resolve-hook.mjs ./tests/resolve-hook.mjs
COPY --from=build --chown=pcbhub /app/src/lib ./src/lib

RUN mkdir -p /data && chown pcbhub /data

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    PCBHUB_DATA_DIR=/data \
    HOME=/home/pcbhub \
    QT_QPA_PLATFORM=offscreen \
    BODY_SIZE_LIMIT=210M

USER pcbhub
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/about').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "build/index.js"]
