# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime stage (nginx no-root, mínimo) --------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Config que sirve el SPA y proxea /api -> api:8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
