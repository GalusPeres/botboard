# Multi-stage build:
# 1) builder — installs all deps and runs `vite build`
# 2) runtime — installs prod deps only and serves dist/ via Express

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server ./server
EXPOSE 3000
CMD ["node", "server/index.js"]
