FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY --chmod=755 slackp ./slackp

RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser && \
    mkdir -p /app/data && chown 1001:1001 /app/data
USER appuser

EXPOSE 3000

# Pick the scheme from ENABLE_HTTPS so the healthcheck matches how the app serves
# (previously hardcoded https, which marked HTTP deployments as unhealthy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD sh -c 'if [ "$ENABLE_HTTPS" = "true" ]; then wget -q --spider --no-check-certificate https://localhost:3000/health; else wget -q --spider http://localhost:3000/health; fi' || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
