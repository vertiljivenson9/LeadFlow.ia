-- LeadFlow AI - Database Schema
-- ================================================
-- Ejecutar en: Dashboard > D1 > leadflow-db > Console

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    value REAL DEFAULT 0,
    stage TEXT DEFAULT 'new',
    source TEXT,
    notes TEXT,
    organization_id TEXT NOT NULL,
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Lead activities/notes
CREATE TABLE IF NOT EXISTS lead_activities (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Queue jobs (free alternative to Cloudflare Queues)
CREATE TABLE IF NOT EXISTS queue_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
);

-- Email logs
CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    to_email TEXT NOT NULL,
    subject TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON queue_jobs(status);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id);
