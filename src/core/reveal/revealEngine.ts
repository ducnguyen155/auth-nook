import { randomInt, randomUuid } from '../crypto/random.ts';
import type { VaultService } from '../vault/vaultService.ts';
import { verifyPasskeyChar } from './passkey.ts';

export type RevealAction = 'show' | 'copy' | 'edit';

export interface RevealChallenge {
  challengeId: string;
  itemId: string;
  action: RevealAction;
  /** 0-based index into the passkey */
  index: number;
  /** 1-based index for UI display */
  displayIndex: number;
  expiresAt: number;
}

export interface RevealGrant {
  grantId: string;
  itemId: string;
  action: RevealAction;
  expiresAt: number;
}

export type VerifyChallengeResult =
  | { ok: true; grant: RevealGrant }
  | { ok: false; locked: boolean; remainingAttempts: number; reason: 'invalid' | 'expired' };

const CHALLENGE_TTL_MS = 30_000;
const GRANT_TTL_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Protected Reveal challenge-response engine.
 * - Generates unbiased random 0-based passkey indices without repeating the previous index.
 * - Challenges are single-use and expire after 30s.
 * - Grants are single-use, scoped to (itemId, action), and expire after 10s.
 * - Persists consecutive failure counts and locks the vault after 3 failed attempts.
 */
export class RevealEngine {
  private readonly vault: VaultService;
  private readonly now: () => number;
  private challenges = new Map<string, RevealChallenge>();
  private grants = new Map<string, RevealGrant>();

  constructor(vault: VaultService, now: () => number = () => Date.now()) {
    this.vault = vault;
    this.now = now;
  }

  hasPasskey(): boolean {
    return this.vault.getPasskeyRecord() !== null;
  }

  async createChallenge(itemId: string, action: RevealAction): Promise<RevealChallenge> {
    const record = this.vault.getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not configured.');
    }

    const state = this.vault.getRevealState();
    let index = randomInt(record.length);
    if (record.length > 1 && state.lastIndex !== null) {
      while (index === state.lastIndex) {
        index = randomInt(record.length);
      }
    }

    await this.vault.setRevealState({
      ...state,
      lastIndex: index,
    });

    const challenge: RevealChallenge = {
      challengeId: randomUuid(),
      itemId,
      action,
      index,
      displayIndex: index + 1,
      expiresAt: this.now() + CHALLENGE_TTL_MS,
    };
    this.challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  async verify(challengeId: string, char: string): Promise<VerifyChallengeResult> {
    const challenge = this.challenges.get(challengeId);
    // Single-use: remove immediately regardless of outcome.
    this.challenges.delete(challengeId);

    if (!challenge || this.now() > challenge.expiresAt) {
      const state = this.vault.getRevealState();
      return {
        ok: false,
        locked: false,
        remainingAttempts: Math.max(0, MAX_CONSECUTIVE_FAILURES - state.failedAttempts),
        reason: 'expired',
      };
    }

    const record = this.vault.getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not configured.');
    }

    const passkeyKey = this.vault.getPasskeyKey();
    const state = this.vault.getRevealState();

    if (verifyPasskeyChar(passkeyKey, record, challenge.index, char)) {
      if (state.failedAttempts !== 0) {
        await this.vault.setRevealState({ ...state, failedAttempts: 0 });
      }
      const grant: RevealGrant = {
        grantId: randomUuid(),
        itemId: challenge.itemId,
        action: challenge.action,
        expiresAt: this.now() + GRANT_TTL_MS,
      };
      this.grants.set(grant.grantId, grant);
      return { ok: true, grant };
    }

    const failures = state.failedAttempts + 1;
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await this.vault.setRevealState({ ...state, failedAttempts: 0 });
      this.clearAll();
      await this.vault.lock();
      return {
        ok: false,
        locked: true,
        remainingAttempts: 0,
        reason: 'invalid',
      };
    }

    await this.vault.setRevealState({ ...state, failedAttempts: failures });
    return {
      ok: false,
      locked: false,
      remainingAttempts: MAX_CONSECUTIVE_FAILURES - failures,
      reason: 'invalid',
    };
  }

  consumeGrant(grantId: string, itemId: string, action: RevealAction): boolean {
    const grant = this.grants.get(grantId);
    this.grants.delete(grantId);
    if (!grant) return false;
    if (this.now() > grant.expiresAt) return false;
    return grant.itemId === itemId && grant.action === action;
  }

  clearAll(): void {
    this.challenges.clear();
    this.grants.clear();
  }
}
