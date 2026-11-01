# Stage 1: Build Vue 3 + Vite static SPA catalog for @gkucmierz/ci-workflows
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json .npmrc* ./
RUN npm install

COPY . .
RUN npm test && npm run sanitize && npm run build

# Stage 2: Serve static SPA with hardened Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
