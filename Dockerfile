# Drafter's web app, served from your own computer or server (docs: /docs/self-hosting/). The app is
# static files: nothing here keeps a script, and this build has no analytics (DRAFTER_ANALYTICS is
# set only by drafter.dev's own build, in apps/web/netlify.toml).
#
# Base images are pinned by digest; Dependabot proposes updates.
FROM node:24.22.3-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /app
# The packages first, from the lockfile alone, so a change to the code doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The one patch to a dependency (pnpm-workspace.yaml, patchedDependencies): the install needs it.
COPY patches ./patches
RUN corepack enable && pnpm fetch
COPY . .
# Only the web app and what it needs, so no Electron download. The Licences page copies the licence
# files of drafter-mcp's SDK, so that package's dependencies are installed too.
RUN pnpm install --offline --frozen-lockfile --filter "@drafter/web..." --filter drafter-mcp \
  && pnpm --filter "@drafter/web..." run build \
  && node apps/web/scripts/caddyfile.mjs apps/web/.output/public /tmp/Caddyfile

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
COPY --from=build /app/apps/web/.output/public /srv
COPY --from=build /tmp/Caddyfile /etc/caddy/Caddyfile
# `_headers` is Netlify's file, turned into the Caddyfile above; it isn't a page to serve. Caddy
# ships able to bind low ports, a file capability that no-new-privileges refuses to start with, and
# port 8080 doesn't need it.
RUN rm /srv/_headers && setcap -r /usr/bin/caddy
USER 65534:65534
EXPOSE 8080
