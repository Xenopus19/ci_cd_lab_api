FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


# --- Этап 2: Финальный образ для продакшена ---
FROM node:24-alpine AS runner

WORKDIR /app

# Устанавливаем переменные окружения
ENV NODE_ENV=production

# Копируем package файлы и устанавливаем ТОЛЬКО продакшен-зависимости
COPY package*.json ./
RUN npm ci --only=production

# Копируем скомпилированный код из этапа сборки
COPY --from=builder /app/dist ./dist

# 3. Открываем порт вебсервісу (порт, который слушает ваше приложение, например 3000)
EXPOSE 3000

# 4. Запускаем застосунок під час старту контейнера
CMD ["node", "dist/index.js"]