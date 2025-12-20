-- users (минимальная)
INSERT INTO "user" (id, username, "displayName", "passwordHash")
VALUES (
  gen_random_uuid(),
  'test',
  'Test User',
  crypt('123456', gen_salt('bf'))
);


CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  display_name TEXT,
  public_key TEXT, -- опционально, если планируем E2E
  created_at TIMESTAMP DEFAULT now()
);

-- chats
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('single','group')),
  title TEXT,
  description TEXT,
  owner_id UUID, -- для group
  created_at TIMESTAMP DEFAULT now()
);

-- chat participants
CREATE TABLE chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','participant')),
  joined_at TIMESTAMP DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

-- chat_files
CREATE TABLE chat_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id UUID REFERENCES users(id),
  chat_id UUID REFERENCES chats(id),
  filename TEXT,
  path TEXT, -- локальный путь на сервере
  mime_type TEXT,
  size INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  encrypted_payload BYTEA NOT NULL, -- зашифрованный blob (см. подход)
  metadata JSONB, -- { attachments: [fileId], replyTo: messageId, pinned: bool, ... }
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- message_read_status (для read receipts)
CREATE TABLE message_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP
);

-- message_reactions
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT, -- e.g. 'like','heart','thumbsup' or emoji
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (message_id, user_id, reaction)
);

CREATE TABLE chat_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id UUID NOT NULL,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);