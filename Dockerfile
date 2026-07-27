# RouteBite MVP — single container (API + static web). Sized for Lightsail micro (1 GB).
# Build: docker build -t routebite --build-arg VITE_GOOGLE_MAPS_API_KEY=... .
# Run:   docker run --rm -p 8080:8080 -v rbdata:/data --env-file .env.mvp routebite

FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mock-swiggy/package.json apps/mock-swiggy/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

FROM deps AS build-web
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/web apps/web
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN bun run --cwd apps/web build

FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    SERVE_WEB=1 \
    WEB_DIST=/app/apps/web/dist \
    DATABASE_URL=file:/data/routebite.db

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mock-swiggy/package.json apps/mock-swiggy/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --production

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY --from=build-web /app/apps/web/dist apps/web/dist

VOLUME ["/data"]
EXPOSE 8080
CMD ["bun", "run", "apps/api/src/index.ts"]
