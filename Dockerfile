# Drafter's web app, served from your own computer or server (docs: /docs/self-hosting/). The app is
# static files: nothing here keeps a script, and this build has no analytics (DRAFTER_ANALYTICS is
# set only by drafter.dev's own build, in apps/web/netlify.toml).
#
# Base images are pinned by digest; Dependabot proposes updates.
FROM node:22.23.4-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
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

FROM caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee
COPY --from=build /app/apps/web/.output/public /srv
COPY --from=build /tmp/Caddyfile /etc/caddy/Caddyfile
# `_headers` is Netlify's file, turned into the Caddyfile above; it isn't a page to serve. Caddy
# ships able to bind low ports, a file capability that no-new-privileges refuses to start with, and
# port 8080 doesn't need it.
RUN rm /srv/_headers && setcap -r /usr/bin/caddy
USER 65534:65534
EXPOSE 8080
