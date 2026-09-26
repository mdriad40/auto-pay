-- ==============================================================================
-- Updated Supabase Schema with Password column & Realtime Support
-- Run this in your Supabase SQL Editor:
-- ==============================================================================

-- 1. Ensure columns exist in gateway_projects
ALTER TABLE public.gateway_projects 
ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT '123456';

-- 2. Enable Supabase Realtime for instant updates on both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_transactions;
