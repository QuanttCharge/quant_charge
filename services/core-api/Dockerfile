FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared-types packages/shared-types
COPY services/core-api services/core-api
RUN npm install && npm run build -w @ev-cms/shared-types && npm run build -w @ev-cms/core-api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/core-api/dist ./dist
COPY --from=build /app/services/core-api/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
