# Документация кода — src

Цель: кратко и конкретно объяснить структуру исходников в `src/`, основные паттерны, контракты и примеры для быстрого включения разработчика или AI-агента.

---

## Краткий обзор архитектуры

Проект — NestJS микросервис чата. В проекте сочетаются следующие подходы к работе с базой данных:
- Prisma (файл `prisma/schema.prisma`) — схема и миграции для PostgreSQL.
- TypeORM (директория `src/entities`) — сущности и репозитории, которые используются в сервисах (см. `@InjectRepository`).

Важно: в репозитории присутствуют оба стека; при изменениях проверяйте, какой подход используется в модуле (Prisma client или TypeORM repository) и оставайтесь последовательными внутри одного модуля.

---

## Основные модули и файлы

- `src/auth/`
  - `auth.middleware.ts` — middleware для REST; извлекает `x-user-id` или `Authorization: Bearer <id>` и ставит `(req as any).user = { id }`. Сейчас реализована базовая проверка и выброс `UnauthorizedException` при отсутствии токена.
  - `session.service.ts` — сервис для управления сессиями (см. файл для деталей).

- `src/chats/`
  - `chat.controller.ts` — REST контроллер чатов (создание, получение, обновление).
  - `chat.service.ts` — бизнес-логика чатов и сообщений; использует TypeORM репозитории (`@InjectRepository`) — содержит метод `createMessage(senderId, chatId, encryptedPayload, metadata)`.
  - `chat.gateway.ts` — WebSocket gateway (socket.io) — обработка real-time событий (см. файл для точных event'ов).

- `src/crypto/crypto.service.ts` — обёртка/утилиты для шифрования; здесь реализуется логика асимметричного/симметричного шифрования (сервер хранит приватный ключ, клиент использует публичный).

- `src/files/` — хранение вложений и API вызовы для работы с файлами; файлы сохраняются локально, путь хранится в БД (см. `ChatFile` в `prisma/schema.prisma`).

- `src/entities/` — TypeORM сущности (Chat, ChatParticipant, Message, ChatFile и т.д.). Примеры:
  - `message.entity.ts` — поле `encryptedPayload: Buffer` (`bytea` в Postgres), `senderId: string`, `metadata: jsonb`.
  - `chat-participant.entity.ts` — связывает `chat` и `userId`, содержит `role`.

- `prisma/schema.prisma` — полная схема БД, модели: `User`, `Chat`, `Message`, `ChatFile`, `Reaction`, `PinnedMessage` и т.д. Используется для миграций и генерации Prisma Client.

---

## Важные соглашения и контракты

1. Аутентификация REST
   - Middleware `auth.middleware.ts` ожидает заголовок `x-user-id` или `Authorization: Bearer <id>`.
   - После прохождения middleware в `req.user.id` доступен id пользователя.

2. Аутентификация WebSocket
   - Взаимодействие через socket.io: при `handshake` ожидается заголовок `Authorization` с тем же форматом `Bearer <id>`.

3. Сообщения (контракт `createMessage`)
   - Входные параметры: `senderId: string`, `chatId: string`, `encryptedPayload: string` (base64), `metadata: any`.
   - Внутри сервиса: `encryptedPayload` конвертируется и сохраняется в `bytea`/Buffer: `Buffer.from(encryptedPayload, 'base64')`.
   - Возвращаемый объект (пример):
     {
       id: string,
       chatId: string,
       senderId: string,
       metadata: any,
       createdAt: string,
       encryptedPayload: string // base64 — сервис возвращает тот же payload
     }

4. Вложения (files)
   - Ограничение размера — 10 MB (прежде чем сохранять, валидировать размер на уровне контроллера/исполнителя).
   - Файлы сохраняются локально, в БД сохраняется путь (`path`) и мета (`mimeType`, `size`).

5. Роли в групповых чатах
   - `OWNER`, `ADMIN`, `PARTICIPANT` (см. enum в `prisma/schema.prisma` и поле `role` в `ChatParticipant` entity).
   - Owner — создать/удалить администраторов, менять права; Admin — ограниченный набор операций; Participant — обычный пользователь.

---

## Примеры вызовов

1) Создать чат (REST)

POST /chats
Content-Type: application/json
Headers: Authorization: Bearer <userId>

Body:
{
  "name": "Project Team",
  "description": "Chat for project",
  "participants": ["<user-id-1>", "<user-id-2>"]
}

2) Создать сообщение (через сервис / gateway)
- Клиент шифрует тело сообщениe (асимметрично), получает base64 и посылает payload через socket или REST. На сервере `chat.service.createMessage` ожидает base64 и сохраняет как Buffer.

Пример использования сервиса (серверный код):
```ts
await chatService.createMessage(senderId, chatId, base64Payload, { replyTo: null });
```

---

## Полезные команды (разработка)

- Установка зависимостей:

```powershell
npm install
```

- Prisma (генерация клиента и миграции):

```powershell
npx prisma generate
npx prisma migrate dev --name <migration_name>
npm run prisma:seed
```

- Запуск в dev:

```powershell
npm run start:dev
```

- Docker Compose:

```powershell
docker compose up --build
```

---

## Замечания и рекомендации для разработчиков/AI-агентов

- Перед внесением изменений проверьте, используется ли в модуле Prisma или TypeORM. Не смешивайте подходы внутри одного сервиса.
- При работе с сообщениями всегда учитывайте, что payload — зашифрованные данные. Никогда не пытайтесь декодировать/логировать содержимое сообщений в продакшен-логе.
- Валидация:
  - Проверяйте принадлежность пользователя к чату (`isUserInChat` в `ChatService`).
  - Проверяйте размер файла перед сохранением (<= 10MB).
- При добавлении новых миграций обновляйте `prisma/schema.prisma` и прогоняйте `npx prisma migrate dev`.

---

## Где смотреть примеры

- Запросы/логика WebSocket — `src/chats/chat.gateway.ts`.
- Сохранение сообщений — `src/chats/chat.service.ts`.
- Сущности БД (TypeORM) — `src/entities/*.ts`.
- Полная схема DB — `prisma/schema.prisma`.
- Middleware аутентификации — `src/auth/auth.middleware.ts`.

---

Если нужно, могу:
- Сгенерировать более подробный API-спецификатор (OpenAPI/Swagger) по существующим контроллерам.
- Добавить диаграмму сущностей (ER) и потоки сообщений.
- Прописать конкретные рекомендации по миграции от Prisma к TypeORM (или наоборот), если хотите согласовать один подход.

Напишите, что предпочитаете дальше — углубить документацию, добавить тесты или сразу перейти к функционалу (реализация реакции, статусов, вложений).