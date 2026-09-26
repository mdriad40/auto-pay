-- ==============================================================================
-- Supabase Schema for Gateway Admins
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gruzpbfhhujmerwbdamo/sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.gateway_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    is_superadmin BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.gateway_admins ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert for initial admin creation
CREATE POLICY "Allow public read gateway_admins" 
ON public.gateway_admins FOR SELECT USING (true);

CREATE POLICY "Allow public insert gateway_admins" 
ON public.gateway_admins FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update gateway_admins" 
ON public.gateway_admins FOR UPDATE USING (true);
