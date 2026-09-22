# syntax=docker/dockerfile:1

# ---- build: compile the SvelteKit app ---------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: Ubuntu + KiCad 10 from the official KiCad PPA -----------------
FROM ubuntu:24.04

# The 3D model library is several GB. Without it the 3D view shows the bare
# board with no components: --build-arg INSTALL_3D_MODELS=false
ARG INSTALL_3D_MODELS=true
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends software-properties-common gpg-agent ca-certificates \
 && add-apt-repository -y ppa:kicad/kicad-10.0-releases \
 && apt-get update \
 && apt-get install -y --no-install-recommends kicad git tini \
 && if [ "$INSTALL_3D_MODELS" = "true" ]; then apt-get install -y --no-install-recommends kicad-packages3d; fi \
 && apt-get purge -y software-properties-common gpg-agent \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 pcbgit \
 && kicad-cli --version

# Build stage is Debian Bookworm (glibc 2.36); Ubuntu 24.04 ships 2.39, so the binary runs as-is.
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=build --chown=pcbgit /app/build ./build
COPY --from=build --chown=pcbgit /app/node_modules ./node_modules
COPY --from=build --chown=pcbgit /app/package.json ./package.json
COPY --from=build --chown=pcbgit /app/scripts ./scripts
COPY --from=build --chown=pcbgit /app/tests/resolve-hook.mjs ./tests/resolve-hook.mjs
COPY --from=build --chown=pcbgit /app/src/lib ./src/lib

RUN mkdir -p /data && chown pcbgit /data

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    PCBGIT_DATA_DIR=/data \
    HOME=/home/pcbgit \
    QT_QPA_PLATFORM=offscreen \
    BODY_SIZE_LIMIT=210M \
    PCBGIT_RESTART_ON_RESTORE=true

USER pcbgit
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/about').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "build/index.js"]
