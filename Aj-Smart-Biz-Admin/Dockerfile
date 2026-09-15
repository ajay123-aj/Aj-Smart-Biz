# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ #
# Aj Smart Biz — Company Admin console. Production image.
#
#     docker build -t aj-smart-biz-admin .
#     docker run -p 4300:80 -e API_ORIGIN=http://aj-smart-biz-backend:4000 aj-smart-biz-admin
#
# Two stages, because the thing that builds an Angular app and the thing that
# serves one have nothing in common. The build stage is Node and the ~400 MB of
# devDependencies the CLI needs; the runtime stage is nginx and a directory of
# static files. Nothing from the first stage reaches the second except `dist`.
#
# **The image contains no configuration.** The one setting it has, API_ORIGIN,
# is read at *start-up* — see the note on the template below — so the same
# image runs against dev, staging and production unchanged.
# ------------------------------------------------------------------ #

# Node 24, matching the backend image. Angular 22 supports ^20.19 || ^22.12 || ^24.
ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.29-alpine

# -------------------------------- build -------------------------------- #
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Only the manifests first, so this layer survives every commit that does not
# change a dependency — which is nearly all of them, and is the difference
# between a 30-second build and a three-minute one.
#
# `npm ci` rather than `npm install`: it installs exactly what the lockfile
# pins and fails instead of quietly resolving something newer. devDependencies
# are NOT omitted here — @angular/build and the compiler live there, and the
# build cannot run without them.
COPY package.json package-lock.json ./

# The retry flags are not superstition. A full dependency tree is a few
# thousand requests, and npm's default of two retries is not enough for one
# connection reset to be absorbed rather than to fail the whole install --
# which on a shared CI runner is a red build nobody can act on. Five
# retries, backing off further, turns a blip into a slower build.
RUN npm ci \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=180000

COPY . .

# `production` is the default configuration in angular.json, but it is named
# explicitly: the default is a line in a file someone can change, and a console
# accidentally built in development mode ships source maps, no minification and
# a localhost API URL.
#
# THIS STEP NEEDS OUTBOUND INTERNET, which is not obvious and is worth knowing
# before it fails. `src/index.html` links Inter from fonts.googleapis.com, and
# an Angular production build inlines linked fonts by default — so the build
# fetches that stylesheet, and a build host that cannot reach Google Fonts
# fails with "Inlining of fonts failed" rather than with anything about the
# network. GitHub-hosted runners are fine; an offline or firewalled self-hosted
# runner is not. The fix there is to set optimization.fonts.inline=false in
# angular.json and accept the fonts loading from Google in the browser, or to
# vendor the font into the repository — both are product decisions, so neither
# is made here.
RUN npm run build -- --configuration production

# ------------------------------- runtime ------------------------------- #
FROM nginx:${NGINX_VERSION} AS runtime

# The nginx entrypoint runs every file in /etc/nginx/templates through
# `envsubst` on start-up and writes the result into conf.d.
#
# The filter is what keeps that from also eating nginx's own variables. Without
# it, `$uri`, `$host` and `$request_uri` are simply unset names as far as
# envsubst is concerned and would be substituted away to nothing — which breaks
# the SPA fallback and the proxy in ways that are very hard to read back from a
# 404.
#
# NGINX_LOCAL_RESOLVERS is in the filter because the template uses it; it is
# produced by the image's own 15-local-resolvers script, which reads the
# container's /etc/resolv.conf. That script is opt-in, and the line below is
# what opts in. See the long note in the template for why resolving the API at
# request time rather than at start-up matters here.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV NGINX_ENVSUBST_FILTER="^(API_ORIGIN|NGINX_LOCAL_RESOLVERS)$"

# Where the console reaches the API, resolved on the Docker network by
# container name. Override it at `docker run` for any other topology.
#
# NO TRAILING SLASH, and no path. The template appends the request URI to this
# value, so `http://host:4000` gives the API `/api/v1/me` and a trailing slash
# gives it `//api/v1/me` — which is a 404 that looks like a typo nobody made.
ENV API_ORIGIN=http://aj-smart-biz-backend:4000

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# The `browser` subdirectory, not `dist` itself: @angular/build:application
# splits its output into browser/ and (for SSR builds) server/, and copying the
# level above would put a `browser/` in the document root and serve nothing.
# The project name is the directory name from angular.json — if that project is
# ever renamed, this COPY fails the build rather than producing an empty image.
COPY --from=build /app/dist/Aj-Smart-Biz-Admin/browser /usr/share/nginx/html

EXPOSE 80

# Asks nginx for the one file that must exist. A container that is running but
# serving a broken config is otherwise indistinguishable from a healthy one
# until somebody opens it in a browser.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/index.html || exit 1
