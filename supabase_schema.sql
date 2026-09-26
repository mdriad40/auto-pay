-- ==============================================================================
-- bKash Aggregator / Custom Payment Gateway Database Schema for Supabase
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gruzpbfhhujmerwbdamo/sql
-- ==============================================================================

-- 1. Create table for registered projects / merchant clients
CREATE TABLE IF NOT EXISTS public.gateway_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name VARCHAR(100) UNIQUE NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50) NOT NULL,
    website_url VARCHAR(255) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    license_key VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create table for transactions tracked per project
CREATE TABLE IF NOT EXISTS public.gateway_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.gateway_projects(id) ON DELETE SET NULL,
    project_name VARCHAR(100) NOT NULL,
    payment_id VARCHAR(100),
    trx_id VARCHAR(100),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BDT',
    intent VARCHAR(50) DEFAULT 'sale',
    merchant_invoice_number VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(50),
    payer_reference VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Initiated', -- 'Initiated', 'Completed', 'Failed', 'Cancelled'
    status_message TEXT,
    origin_url VARCHAR(255),
    raw_bkash_response JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ
);

-- 3. Indexes for fast query and filtering
CREATE INDEX IF NOT EXISTS idx_projects_api_key ON public.gateway_projects(api_key);
CREATE INDEX IF NOT EXISTS idx_projects_license_key ON public.gateway_projects(license_key);
CREATE INDEX IF NOT EXISTS idx_projects_name ON public.gateway_projects(project_name);
CREATE INDEX IF NOT EXISTS idx_transactions_project_name ON public.gateway_transactions(project_name);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON public.gateway_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_trx_id ON public.gateway_transactions(trx_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.gateway_transactions(created_at DESC);

-- 4. Enable Row Level Security (RLS) but allow anon access with public anon key for gateway operation
ALTER TABLE public.gateway_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_transactions ENABLE ROW LEVEL SECURITY;

-- Allow anon read/write for gateway operation
CREATE POLICY "Allow public read gateway_projects" 
ON public.gateway_projects FOR SELECT USING (true);

CREATE POLICY "Allow public insert gateway_projects" 
ON public.gateway_projects FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update gateway_projects" 
ON public.gateway_projects FOR UPDATE USING (true);

CREATE POLICY "Allow public read gateway_transactions" 
ON public.gateway_transactions FOR SELECT USING (true);

CREATE POLICY "Allow public insert gateway_transactions" 
ON public.gateway_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update gateway_transactions" 
ON public.gateway_transactions FOR UPDATE USING (true);
