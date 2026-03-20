import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index';

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const res = await app.request('/health');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('status', 'healthy');
    expect(data.data).toHaveProperty('timestamp');
    expect(data.data).toHaveProperty('version', '1.0.0');
  });
});

describe('API Info', () => {
  it('should return API information', async () => {
    const res = await app.request('/api');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('name', 'LeadFlow AI API');
    expect(data.data).toHaveProperty('version', '1.0.0');
    expect(data.data).toHaveProperty('endpoints');
    expect(data.data.endpoints).toHaveProperty('auth');
    expect(data.data.endpoints).toHaveProperty('leads');
    expect(data.data.endpoints).toHaveProperty('pipeline');
    expect(data.data.endpoints).toHaveProperty('dashboard');
  });
});

describe('Authentication Endpoints', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    teamName: 'Test Team',
  };

  let accessToken: string;

  it('should register a new user', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });

    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('user');
    expect(data.data).toHaveProperty('team');
    expect(data.data).toHaveProperty('tokens');
    expect(data.data.user.email).toBe(testUser.email.toLowerCase());

    accessToken = data.data.tokens.accessToken;
  });

  it('should not register duplicate email', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });

    expect(res.status).toBe(409);
  });

  it('should login with correct credentials', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('user');
    expect(data.data).toHaveProperty('tokens');
  });

  it('should not login with wrong password', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'WrongPassword',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should get current user with valid token', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('user');
    expect(data.data.user.email).toBe(testUser.email.toLowerCase());
  });

  it('should reject request without token', async () => {
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Leads Endpoints', () => {
  const testUser = {
    email: `leads-test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Leads',
    lastName: 'Tester',
    teamName: 'Leads Test Team',
  };

  let accessToken: string;
  let leadId: string;

  beforeAll(async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const data = await res.json();
    accessToken = data.data.tokens.accessToken;
  });

  it('should create a new lead', async () => {
    const res = await app.request('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: 'Test Lead',
        email: 'lead@example.com',
        phone: '+1234567890',
        company: 'Test Company',
        source: 'website',
        notes: 'Test notes',
      }),
    });

    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toHaveProperty('success', true);
    expect(data.data).toHaveProperty('id');
    expect(data.data.name).toBe('Test Lead');
    expect(data.data.stage).toBe('new');
    expect(data.data.score).toBeGreaterThan(0);

    leadId = data.data.id;
  });

  it('should list leads', async () => {
    const res = await app.request('/api/leads', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('should get lead by ID', async () => {
    const res = await app.request(`/api/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.id).toBe(leadId);
  });

  it('should update lead stage', async () => {
    const res = await app.request(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ stage: 'contacted' }),
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.stage).toBe('contacted');
  });

  it('should add note to lead', async () => {
    const res = await app.request(`/api/leads/${leadId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ note: 'Test note from API' }),
    });

    expect(res.status).toBe(201);
  });

  it('should delete lead', async () => {
    const res = await app.request(`/api/leads/${leadId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
  });
});

describe('Validation', () => {
  it('should reject invalid email on registration', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        teamName: 'Test Team',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('should reject short password on registration', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'short',
        firstName: 'Test',
        lastName: 'User',
        teamName: 'Test Team',
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe('Error Handling', () => {
  it('should return 404 for unknown endpoint', async () => {
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
  });
});
