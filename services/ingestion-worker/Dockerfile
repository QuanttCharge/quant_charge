FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared-types packages/shared-types
COPY services/ingestion-worker services/ingestion-worker
RUN npm install && npm run build -w @ev-cms/shared-types && npm run build -w @ev-cms/ingestion-worker

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/ingestion-worker/dist ./dist
COPY --from=build /app/services/ingestion-worker/package.json ./
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
