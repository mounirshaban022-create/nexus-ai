-- NEXUS AI — Supabase Schema
-- Run this in the Supabase SQL Editor after creating a project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== USER PROFILES (local auth mirror) =====
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  timezone TEXT,
  language TEXT,
  job_title TEXT,
  website TEXT,
  notifications TEXT DEFAULT '{}',
  interests TEXT DEFAULT '[]',
  comm_style TEXT DEFAULT 'balanced',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== CHAT SESSIONS =====
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New conversation',
  kind TEXT DEFAULT 'chat', -- chat | agent | voice
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== CHAT MESSAGES =====
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user | assistant | tool
  content TEXT NOT NULL,
  thinking TEXT,
  tool_name TEXT,
  tool_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);

-- ===== GENERATED IMAGES =====
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  size TEXT,
  url TEXT,
  provider TEXT DEFAULT 'nexus',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== GENERATED VIDEOS =====
CREATE TABLE IF NOT EXISTS generated_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | processing | done | error
  url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== GENERATED DOCUMENTS =====
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT,
  format TEXT,
  title TEXT,
  summary TEXT,
  download_url TEXT,
  size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON generated_documents(user_id, created_at);

-- ===== USER AI PROVIDERS (encrypted API keys per user) =====
CREATE TABLE IF NOT EXISTS user_ai_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL, -- openrouter | deepseek | zhipu etc
  label TEXT NOT NULL,
  api_key_enc TEXT NOT NULL, -- encrypted client-side
  base_url TEXT,
  default_model TEXT,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

-- ===== USER EMAIL ACCOUNTS =====
CREATE TABLE IF NOT EXISTS user_email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  email TEXT NOT NULL,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 465,
  smtp_secure BOOLEAN DEFAULT true,
  username TEXT,
  password_enc TEXT NOT NULL,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ROW LEVEL SECURITY (users only see their own data) =====
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_accounts ENABLE ROW LEVEL SECURITY;

-- Policies: users can only CRUD their own rows
CREATE POLICY "own sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own messages" ON chat_messages FOR ALL USING (
  session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
) WITH CHECK (
  session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "own images" ON generated_images FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own videos" ON generated_videos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own documents" ON generated_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own providers" ON user_ai_providers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own emails" ON user_email_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('documents', 'documents', false),
  ('images', 'images', true),
  ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "own documents" ON storage.objects FOR ALL USING (
  bucket_id = 'documents' AND owner = auth.uid()
) WITH CHECK (bucket_id = 'documents' AND owner = auth.uid());

CREATE POLICY "public read images" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "own image upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images' AND owner = auth.uid());

CREATE POLICY "own videos" ON storage.objects FOR ALL USING (
  bucket_id = 'videos' AND owner = auth.uid()
) WITH CHECK (bucket_id = 'videos' AND owner = auth.uid());

-- ===== REALTIME (live sync across devices) =====
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
