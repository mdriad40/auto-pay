-- ==============================================================================
-- Updated Supabase Schema with Password column & Realtime Support
-- Run this in your Supabase SQL Editor:
-- ==============================================================================

-- 1. Ensure columns exist in gateway_projects
ALTER TABLE public.gateway_projects 
ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT '123456';

-- 3. Create settings table for global configuration (Gateway Base URL, etc.)
CREATE TABLE IF NOT EXISTS public.gateway_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.gateway_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all gateway_settings" 
ON public.gateway_settings FOR ALL USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_settings;
