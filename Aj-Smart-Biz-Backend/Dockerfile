# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ #
# Aj Smart Biz API — production image.
#
#     docker build -t aj-smart-biz-backend .
#     docker run -p 4000:4000 --env-file .env.production aj-smart-biz-backend
#
# Two stages, and the split is not cosmetic: `npm ci` needs the lockfile and a
# writable tree, and neither of those has any business being in the image that
# ships. The runtime stage copies the resolved `node_modules` and the source,
# and nothing else.
#
# **Nothing in this image is configuration.** `src/config/env.js` loads
# `.env.<NODE_ENV>` only if the file exists and lets the real process
# environment win over it either way, so the container is configured with
# `--env-file` or with whatever the orchestrator injects. The repository's own
# `.env.production` is excluded in `.dockerignore` — it carries a database
# password, two JWT secrets and the super admin's password, and an image on a
# public registry is the last place any of that should be.
# ------------------------------------------------------------------ #

# Node 22, matching the version the project is developed against. Alpine
# because this service compiles nothing: `sqlite3` is the only native
# dependency and it is a devDependency, dropped by `--omit=dev` below.
ARG NODE_VERSION=22-alpine

# ------------------------------ dependencies ------------------------------ #
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Only the manifests, so this layer is rebuilt when a dependency changes and
# reused on every commit that only touches source. `npm ci` rather than
# `npm install`: it installs exactly what the lockfile says and fails instead of
# quietly resolving something newer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# -------------------------------- runtime -------------------------------- #
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# `node` is a real unprivileged user in this image, and the process has no
# reason to be root. Ownership is set on the way in rather than with a later
# `chown -R`, which would double the size of both layers.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Where multer writes company logos, favicons and the seeders' placeholder
# artwork. Created here so an anonymous volume mounted over it inherits the
# right owner; **mount a real volume over it in production** or the uploads go
# with the container.
RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app/uploads /app/logs
VOLUME ["/app/uploads"]

USER node
EXPOSE 4000

# `GET /` is the API's own liveness route — see `src/app.js`. Given 40s to come
# up, because the first boot syncs the schema and seeds the root super admin
# before it starts listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `node` directly rather than `npm start`: npm would sit between the init
# system and the server, and SIGTERM would reach npm instead of the process
# with the graceful shutdown handler in `src/server.js`.
CMD ["node", "src/server.js"]
