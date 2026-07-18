FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/ocpp-1.6j-types/package.json packages/ocpp-1.6j-types/
COPY services/ocpp-gateway/package.json services/ocpp-gateway/
RUN npm install --workspace=@ev-cms/ocpp-gateway --include-workspace-root=false || npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @ev-cms/shared-types \
 && npm run build -w @ev-cms/ocpp-1.6j-types \
 && npm run build -w @ev-cms/ocpp-gateway

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/ocpp-gateway/dist ./dist
COPY --from=build /app/services/ocpp-gateway/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 9000
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
