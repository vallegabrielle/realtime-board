FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "start"]
