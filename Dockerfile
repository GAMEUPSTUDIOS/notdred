# notdred.io server image (used by Render; works on any Docker host).
# Builds the native Box2D physics module and serves the game page, the WebSocket server and classic mode.
FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:native
ENV HOST=0.0.0.0
EXPOSE 10000
CMD ["node", "server/server.cjs"]
