# Production image for the AI Analytics Platform.
# Multi-stage: build the Vite bundle + bundled server, then run the server only.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
# Production deps only (bundled server.cjs needs: express, better-sqlite3, dotenv...)
RUN npm ci --omit=dev --ignore-scripts || npm ci --omit=dev
# Rebuild native modules for this image (better-sqlite3 is a native addon)
RUN npm rebuild better-sqlite3 || true
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
# Data dir for SQLite (mount a volume here in production!)
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
