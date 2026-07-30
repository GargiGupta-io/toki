# Toki API image.
#
# Build from the repository root, not from this directory:
#   docker build -f apps/api/Dockerfile .
# The service is one workspace inside a monorepo and shares `@toki/shared` with
# the desktop app, so the build needs the root lockfile to resolve either.
#
# Nothing secret is baked in. Every credential arrives as an environment
# variable at run time, set with `fly secrets set`, so this image is safe to
# push to a registry and a leaked image gives up nothing.

# Pinned by digest, not by tag. A tag is a moving pointer: `node:24-alpine`
# means something different next month, so an unpinned build is not
# reproducible and silently picks up whatever was published since. Resolved
# 2026-07-29; update it deliberately, with the change visible in the diff.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS deps

WORKDIR /app

# Only the manifests first. This layer is rebuilt when a dependency changes,
# not on every source edit, which is most of the difference between a ten
# second deploy and a two minute one.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# --omit=dev leaves out test and build tooling. --ignore-scripts stops any
# dependency's install hook running with network access during the build.
RUN npm ci --workspace @toki/api --include-workspace-root \
    --omit=dev --ignore-scripts

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

# Signals reach a process started by an init, so a deploy or a scale-down stops
# the service cleanly instead of being killed after a timeout.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# Node's own unprivileged user. A service that never writes to disk has no
# reason to run as root, and this is the cheapest way to limit what a
# compromise of the process could reach.
USER node

EXPOSE 8787

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]
