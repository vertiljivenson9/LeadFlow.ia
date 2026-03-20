import { describe, it, expect } from 'vitest';
import { calculateLeadScore } from '../src/services/lead';
import { hashPassword, verifyPassword } from '../src/utils/crypto';

describe('Lead Scoring', () => {
  it('should give higher score to referral leads', () => {
    const referralScore = calculateLeadScore('referral', new Date().toISOString(), 0);
    const websiteScore = calculateLeadScore('website', new Date().toISOString(), 0);
    const manualScore = calculateLeadScore('manual', new Date().toISOString(), 0);

    expect(referralScore).toBeGreaterThan(websiteScore);
    expect(websiteScore).toBeGreaterThan(manualScore);
  });

  it('should give higher score to recent leads', () => {
    const recentDate = new Date().toISOString();
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const recentScore = calculateLeadScore('website', recentDate, 0);
    const oldScore = calculateLeadScore('website', oldDate, 0);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('should increase score with activity', () => {
    const noActivityScore = calculateLeadScore('website', new Date().toISOString(), 0);
    const withActivityScore = calculateLeadScore('website', new Date().toISOString(), 5);

    expect(withActivityScore).toBeGreaterThan(noActivityScore);
  });

  it('should cap score at 100', () => {
    const score = calculateLeadScore('referral', new Date().toISOString(), 100);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should give minimum score based on source weight', () => {
    const score = calculateLeadScore('referral', new Date().toISOString(), 0);
    expect(score).toBeGreaterThanOrEqual(40);
  });
});

describe('Password Hashing', () => {
  it('should hash password correctly', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash).toContain(':');
  });

  it('should verify correct password', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword('WrongPassword', hash);

    expect(isValid).toBe(false);
  });

  it('should produce different hashes for same password', async () => {
    const password = 'TestPassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });
});

describe('Source Weights', () => {
  const expectedWeights: Record<string, number> = {
    referral: 40,
    website: 30,
    event: 25,
    social: 20,
    email: 15,
    phone: 15,
    manual: 10,
    other: 5,
  };

  it('should assign correct weights to all sources', () => {
    Object.entries(expectedWeights).forEach(([source, expectedWeight]) => {
      const score = calculateLeadScore(source as 'website' | 'referral' | 'social' | 'email' | 'phone' | 'event' | 'manual' | 'other', new Date().toISOString(), 0);
      expect(score).toBeGreaterThanOrEqual(expectedWeight);
    });
  });
});
