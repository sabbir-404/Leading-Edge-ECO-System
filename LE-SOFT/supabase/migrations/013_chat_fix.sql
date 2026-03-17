-- Migration: 013_chat_fix
-- Description: Creates the `app_chat_messages` table and typing status functions for the real-time chat feature.

-- 1. Create the Chat Messages table
CREATE TABLE IF NOT EXISTS public.app_chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file'
    file_name VARCHAR(255),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster chat history retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_participants 
ON public.app_chat_messages (sender_id, receiver_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
ON public.app_chat_messages (created_at DESC);

-- Enable RLS for Chat Messages
ALTER TABLE public.app_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view messages they sent or received
CREATE POLICY "Users can view their own chat history" 
ON public.app_chat_messages
FOR SELECT
TO authenticated
USING (
    sender_id IN (SELECT id FROM public.users WHERE email = auth.jwt() ->> 'email') OR
    receiver_id IN (SELECT id FROM public.users WHERE email = auth.jwt() ->> 'email')
);

-- Policies: Users can send messages
CREATE POLICY "Users can insert chat messages" 
ON public.app_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id IN (SELECT id FROM public.users WHERE email = auth.jwt() ->> 'email')
);

-- Note: We are not allowing UPDATE or DELETE on chat messages for audit purposes


-- 2. User Typing Status (Ephemeral State)
-- We will add a small typing status table to track who is currently typing to whom.
-- This gets cleaned up automatically by the app/electron layer, but we can also use a small 
-- tracking table if Postgres pub/sub is used, or just handle it directly via supabase broadcast.
-- Since the frontend is expecting `window.electron.getTypingStatus`, we'll make a lightweight table.

CREATE TABLE IF NOT EXISTS public.chat_typing_status (
    sender_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (sender_id, receiver_id)
);

-- Enable RLS for typing status
ALTER TABLE public.chat_typing_status ENABLE ROW LEVEL SECURITY;

-- Allow read
CREATE POLICY "Users can read typing status" 
ON public.chat_typing_status
FOR SELECT
TO authenticated
USING (true);

-- Allow insert/update (Upsert)
CREATE POLICY "Users can update typing status" 
ON public.chat_typing_status
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
