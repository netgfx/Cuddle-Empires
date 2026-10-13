# Room server image. Build from the game/ directory (the server imports the rules engine in src/game):
#   docker build -f server/Dockerfile -t risk-server .
#   docker run -p 8787:8787 risk-server
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
# Only the two runtime deps the server needs (the client bundle's deps are not required).
RUN printf '{"name":"risk-server","private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund ws@8.22.0 tsx@4.23.15 \
 && npm cache clean --force
COPY server/ ./server/
COPY src/game/ ./src/game/
RUN rm -f server/*.test.ts src/game/*.test.ts src/game/testUtils.ts && rm -rf server/dev
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["npx", "tsx", "server/index.ts"]
