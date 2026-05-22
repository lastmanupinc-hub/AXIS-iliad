# syntax=docker/dockerfile:1.7
FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY . /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates make && rm -rf /var/lib/apt/lists/*
EXPOSE 8080
CMD ["sh", "-lc", "node dist/server.js"]