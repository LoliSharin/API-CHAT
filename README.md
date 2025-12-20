# api-chat

Microservice boilerplate: NestJS + Prisma + Postgres + Docker

Quick start (Dev):

1. Скопируйте `.env.example` в `.env` и отредактируйте при необходимости.
2. Установите зависимости:

```powershell
npm install
```

3. Сгенерируйте Prisma Client и выполните миграции (dev):

```powershell
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

4. Запустите в dev режиме:

```powershell
npm run start:dev
```

Docker (Compose):

```powershell
docker compose up --build
```

Postgres будет доступен на порту 5432, сервис API на 3000.
