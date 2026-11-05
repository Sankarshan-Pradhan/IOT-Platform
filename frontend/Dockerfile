# Multi-stage Dockerfile for IoT Platform React Frontend
# Stage 1: Build React/Vite production assets
FROM node:20-alpine AS builder

WORKDIR /app

# Cache node dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and compile
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine

# Copy built static files to Nginx doc root
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom reverse proxy Nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port 80
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
