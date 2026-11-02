# Drafter's web app, served from your own computer or server (docs: /docs/self-hosting/). The app is
# static files: nothing here keeps a script, and this build has no analytics (DRAFTER_ANALYTICS is
# set only by drafter.dev's own build, in apps/web/netlify.toml).
#
# Base images are pinned by digest; Dependabot proposes updates.
FROM node:26.13.0-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build
WORKDIR /app
# The packages first, from the lockfile alone, so a change to the code doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm fetch
COPY . .
# Only the web app and what it needs, so no Electron download. The Licences page copies the licence
# files of drafter-mcp's SDK, so that package's dependencies are installed too.
RUN pnpm install --offline --frozen-lockfile --filter "@drafter/web..." --filter drafter-mcp \
  && pnpm --filter "@drafter/web..." run build \
  && node apps/web/scripts/caddyfile.mjs apps/web/.output/public /tmp/Caddyfile

FROM caddy:2.11.6-alpine@sha256:d44355d3c2149dc580ce2cac735955d1c08d3d00882c30489c241aa51a5c10d9
COPY --from=build /app/apps/web/.output/public /srv
COPY --from=build /tmp/Caddyfile /etc/caddy/Caddyfile
# `_headers` is Netlify's file, turned into the Caddyfile above; it isn't a page to serve. Caddy
# ships able to bind low ports, a file capability that no-new-privileges refuses to start with, and
# port 8080 doesn't need it.
RUN rm /srv/_headers && setcap -r /usr/bin/caddy
USER 65534:65534
EXPOSE 8080
