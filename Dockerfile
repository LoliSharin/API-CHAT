# ---- build ----
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
RUN npm ci --silent || npm install --silent
COPY . .
RUN npm run prisma:generate || true
RUN npm run build

# ---- run ----
FROM node:18-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
