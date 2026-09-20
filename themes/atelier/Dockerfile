# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ #
# Aj Smart Biz — decor & framing commercial theme. Production image.
#
#     docker build -t aj-smart-biz-theme-atelier .
#     docker run -p 4600:4600 \
#       -e API_URL=http://aj-smart-biz-backend:4000/api/v1 \
#       -e TENANT_DOMAIN=decor.example.com \
#       aj-smart-biz-theme-atelier
#
# Three stages. `deps` installs, `build` compiles, `runtime` gets neither — it
# receives the traced output of `output: 'standalone'` and nothing else, which
# is the server, the pages, and the handful of packages they actually require.
#
# ----------------------- build time vs run time ----------------------- #
#
# Most of this app's configuration is read when a request is served, not when
# the image is built: `API_URL` and `TENANT_DOMAIN` are read inside server
# components, server actions and middleware, so they are ordinary `docker run`
# environment variables and the image stays environment-agnostic.
#
# Two things are exceptions, and both are ARGs below rather than ENVs:
#
#   BACKEND_ORIGIN / API_URL   next.config.ts derives the `/uploads` rewrite
#                              from these, and Next.js freezes rewrites into
#                              the route manifest at build time.
#   NEXT_PUBLIC_*              compiled into the browser bundle by definition.
#
# Setting those at run time does nothing, silently, which is exactly the kind
# of failure worth a paragraph. The defaults leave `/uploads` unrewritten,
# which is correct when a proxy in front of this container already serves the
# API on the same origin.
# ------------------------------------------------------------------ #

# Node 24, matching the backend image. Next 15 requires >= 18.18.
ARG NODE_VERSION=24-alpine

# ----------------------------- dependencies ----------------------------- #
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Next's SWC binaries and sharp are glibc-linked in places; libc6-compat is the
# shim Alpine needs for them. Cheap, and its absence surfaces as an
# unenlightening "Error loading shared library" during the build.
RUN apk add --no-cache libc6-compat

# Manifests only, so the install layer is reused by every commit that does not
# touch a dependency. `npm ci` installs exactly what the lockfile pins.
# devDependencies stay: TypeScript compiles during `next build`.
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

# -------------------------------- build -------------------------------- #
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# See the note at the top of this file: these are build-time only, and are
# ARGs so a `docker run -e` cannot appear to set them.
ARG API_URL
ARG BACKEND_ORIGIN
ARG NEXT_PUBLIC_FILES_URL
ENV API_URL=${API_URL} \
    BACKEND_ORIGIN=${BACKEND_ORIGIN} \
    NEXT_PUBLIC_FILES_URL=${NEXT_PUBLIC_FILES_URL}

# Anonymous usage stats, from a CI runner that is rebuilt every run. Off.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ------------------------------- runtime ------------------------------- #
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat

# HOSTNAME is not optional. The standalone server binds it, and its default -
# localhost - means the container's own loopback: the container would start,
# look healthy from inside, and refuse every connection from outside.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4600 \
    HOSTNAME=0.0.0.0

# `node` is a real unprivileged user in this image and the server has no reason
# to be root. Ownership is set on the way in rather than by a later `chown -R`,
# which would double the size of every layer it touched.
#
# Three copies, and all three are needed: standalone carries the server and its
# traced dependencies but deliberately not the static assets, because in a real
# deployment those are usually handed to a CDN instead.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 4600

# `GET /` renders the storefront, which in turn calls the API — so this checks
# the whole path, not just that a process is listening.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4600)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The traced entrypoint standalone emits. Not `npm start`, which would run
# `next start` — unsupported against a standalone build — and would also sit
# between the init system and the server, swallowing SIGTERM.
CMD ["node", "server.js"]
