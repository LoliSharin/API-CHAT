# ---- build ----
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
RUN npm ci --silent

COPY . .
# если появится prisma:generate, команда выполнится; сейчас просто не упадёт
RUN npm run prisma:generate || true
RUN npm run build
# убираем dev-зависимости перед копированием
RUN npm prune --omit=dev

# ---- run ----
FROM node:18-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/uploads ./uploads

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
