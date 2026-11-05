FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


FROM nginx:1.29-alpine AS runner

# Rendered by the nginx image entrypoint (envsubst) into /etc/nginx/conf.d/default.conf
ENV API_URL=http://api:3000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
