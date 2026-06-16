FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/
ENV NODE_ENV=production
EXPOSE 3000
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
