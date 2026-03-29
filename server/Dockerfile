FROM oven/bun:1.3.11
WORKDIR /app
RUN bun init -y && bun add @sqaoss/flowy
WORKDIR /app/node_modules/@sqaoss/flowy/server
RUN bun install --production
EXPOSE 4000
VOLUME /data
CMD ["bun", "src/index.ts"]
