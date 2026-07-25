# syntax=docker/dockerfile:1

# ---- builder: full deps + build the app to a self-contained bundle ----
FROM node:24-alpine AS builder
WORKDIR /usr/src/app
ENV HUSKY=0
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nest build farms

# ---- runner: production deps only + the built dist, as a non-root user ----
FROM node:24-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production HUSKY=0
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=builder /usr/src/app/dist ./dist
RUN addgroup -S app && adduser -S app -G app
USER app
CMD ["node", "dist/apps/farms/main"]
