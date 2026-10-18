# Works with Apple `container build`, Docker and Podman.

# Files are copied explicitly rather than with `COPY . .`, so the build is correct even if a
# builder ignores .dockerignore (the Mac's node_modules would otherwise land in a Linux image).

# ---------- Build: bundle the web app (typecheck and tests run locally, not here) ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared/src shared/src
COPY web/index.html web/vite.config.ts web/tsconfig.json web/
COPY web/src web/src
RUN npm run build -w web

# ---------- Runtime: production dependencies, server source and the built web app ----------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/app.db
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.base.json ./
COPY shared/tsconfig.json shared/
COPY shared/src shared/src
COPY server/tsconfig.json server/
COPY server/src server/src
COPY server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/src/index.ts"]
