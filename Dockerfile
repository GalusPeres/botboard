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
# ffmpeg = Audio-Rendering (Trim/Lautstärke → MP3) für den Sound-Editor;
# yt-dlp = Import von YouTube-Links. yt-dlp zieht python3 als Abhängigkeit.
RUN apk add --no-cache ffmpeg yt-dlp
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data /app/.sessions
EXPOSE 3000
CMD ["node", "server/index.js"]
