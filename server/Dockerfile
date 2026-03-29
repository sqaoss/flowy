FROM oven/bun:1.2 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base
COPY --from=install /app/node_modules node_modules
COPY src src
COPY tsconfig.json .

EXPOSE 4000
CMD ["bun", "src/index.ts"]
