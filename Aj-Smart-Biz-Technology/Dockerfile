# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ #
# Aj Smart Biz Technology — the product website. Production image.
#
#     docker build -t aj-smart-biz-technology .
#     docker run -p 4700:4700 aj-smart-biz-technology
#
# Three stages. `deps` installs, `build` compiles, `runtime` gets neither — it
# receives the traced output of `output: 'standalone'` and nothing else, which
# is the server, the pages, and the handful of packages they actually require.
#
# ------------------- what this image does NOT take ------------------- #
#
# The theme images in `themes/` take `API_URL`, `TENANT_DOMAIN` and a
# `BACKEND_ORIGIN` build argument, because each of them is one deployment
# serving many companies and has to be told which company a request is for.
#
# **This one takes none of those, and that is not an oversight.** It calls no
# API for everything it renders. The headlines, the price list, the capability
# catalogue, the trades and the FAQ are read from `GET /website/bootstrap` at
# request time, and the demo form posts to `POST /website/enquiries`.
#
# So **`API_URL` is required** and the image needs `-e API_URL=...` to do
# anything. It is a plain ENV read at request time, exactly as the theme images
# do it — not a build argument — which is what keeps one image usable in every
# environment. There is no content compiled in and no fallback copy: pointed at
# nothing, this renders an error rather than a stale home page, on purpose.
#
#     docker run -p 4700:3000 -e API_URL=http://aj-smart-biz-backend:4000/api/v1 #       aj-smart-biz-technology
# ------------------------------------------------------------------ #

# Node 24, matching the backend and theme images. Next 15 requires >= 18.18.
ARG NODE_VERSION=24-alpine

# ----------------------------- dependencies ----------------------------- #
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Next's SWC binaries are glibc-linked in places; libc6-compat is the shim
# Alpine needs for them. Cheap, and its absence surfaces as an unenlightening
# "Error loading shared library" during the build.
RUN apk add --no-cache libc6-compat

# Manifests only, so the install layer is reused by every commit that does not
# touch a dependency. `npm ci` installs exactly what the lockfile pins.
# devDependencies stay: TypeScript compiles during `next build`.
COPY package.json package-lock.json ./

# The retry flags are not superstition. A full dependency tree is a few
# thousand requests, and npm's default of two retries is not enough for one
# connection reset to be absorbed rather than to fail the whole install --
# which on a shared CI runner is a red build nobody can act on. Five retries,
# backing off further, turns a blip into a slower build.
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
    PORT=4700 \
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
EXPOSE 4700

# `GET /` renders the home page. With no API behind this site, a 200 here means
# the whole thing is working — unlike the theme images, where the same check is
# also exercising the backend.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4700)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The traced entrypoint standalone emits. Not `npm start`, which would run
# `next start` — unsupported against a standalone build — and would also sit
# between the init system and the server, swallowing SIGTERM.
CMD ["node", "server.js"]
