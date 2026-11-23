import { describe, expect, it } from 'vitest';
import { MemoryDeviceKeyStore } from '../../platform/deviceKeyStore/memoryStore.ts';
import { MemoryPlatform } from '../../platform/memoryPlatform.ts';
import { buildPasskeyRecord, validatePasskey } from '../reveal/passkey.ts';
import { RevealEngine } from '../reveal/revealEngine.ts';
import { VaultService } from '../vault/vaultService.ts';

const TEST_KDF = {
  algorithm: 'argon2id' as const,
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

describe('Protected Reveal Engine', () => {
  it('enforces single-use challenges, expiry, single-use grants, and 3-failure vault lockout', async () => {
    const platform = new MemoryPlatform();
    const vault = new VaultService(platform, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vault.setup('master-pw-123', { deviceBound: false });

    const passkey = '12345';
    validatePasskey(passkey);
    await vault.setPasskeyRecord(buildPasskeyRecord(vault.getPasskeyKey(), passkey));

    let fakeNow = 1_000_000;
    const engine = new RevealEngine(vault, () => fakeNow);

    // 1. Valid challenge -> single-use grant
    const c1 = await engine.createChallenge('item-1', 'show');
    const expectedChar = passkey[c1.index];
    const r1 = await engine.verify(c1.challengeId, expectedChar);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(engine.consumeGrant(r1.grant.grantId, 'item-1', 'show')).toBe(true);
      // Grant cannot be reused
      expect(engine.consumeGrant(r1.grant.grantId, 'item-1', 'show')).toBe(false);
    }
    // Challenge cannot be reused
    const reuse = await engine.verify(c1.challengeId, expectedChar);
    expect(reuse.ok).toBe(false);

    // 2. Expired challenge
    const c2 = await engine.createChallenge('item-1', 'copy');
    fakeNow += 31_000;
    const expired = await engine.verify(c2.challengeId, passkey[c2.index]);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe('expired');

    // 3. Consecutive index never repeats
    let prev = c2.index;
    for (let i = 0; i < 15; i++) {
      const next = await engine.createChallenge('item-1', 'show');
      expect(next.index).not.toBe(prev);
      prev = next.index;
    }

    // 4. Three consecutive failures lock the vault
    for (let attempt = 1; attempt <= 2; attempt++) {
      const c = await engine.createChallenge('item-1', 'show');
      const res = await engine.verify(c.challengeId, '9');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.locked).toBe(false);
        expect(res.remainingAttempts).toBe(3 - attempt);
      }
    }

    const cFail3 = await engine.createChallenge('item-1', 'show');
    const res3 = await engine.verify(cFail3.challengeId, '9');
    expect(res3.ok).toBe(false);
    if (!res3.ok) {
      expect(res3.locked).toBe(true);
    }
    expect(vault.isUnlocked()).toBe(false);
  });

  it('scopes single-use grants to matching password itemId and action (show, copy, edit)', async () => {
    const platform = new MemoryPlatform();
    const vault = new VaultService(platform, {
      kdfParams: TEST_KDF,
      deviceKeyStore: new MemoryDeviceKeyStore(),
    });
    await vault.setup('master-pw-123', { deviceBound: false });

    const passkey = '48291';
    await vault.setPasskeyRecord(buildPasskeyRecord(vault.getPasskeyKey(), passkey));

    const pwItem = await vault.createPasswordItem(
      {
        title: 'GitHub',
        website: 'https://github.com',
        username: 'alice',
        categoryId: null,
        tags: [],
      },
      { password: 'super-secret-password', notes: '' }
    );

    const engine = new RevealEngine(vault, () => 2_000_000);

    // Grant for 'show' cannot be used for 'edit' or another itemId
    const showChallenge = await engine.createChallenge(pwItem.id, 'show');
    const showResult = await engine.verify(showChallenge.challengeId, passkey[showChallenge.index]);
    expect(showResult.ok).toBe(true);
    if (showResult.ok) {
      expect(engine.consumeGrant(showResult.grant.grantId, pwItem.id, 'edit')).toBe(false);
    }

    // Valid 'copy' grant succeeds once for matching (itemId, 'copy')
    const copyChallenge = await engine.createChallenge(pwItem.id, 'copy');
    const copyResult = await engine.verify(copyChallenge.challengeId, passkey[copyChallenge.index]);
    expect(copyResult.ok).toBe(true);
    if (copyResult.ok) {
      expect(engine.consumeGrant(copyResult.grant.grantId, 'other-id', 'copy')).toBe(false);
    }

    const copyChallenge2 = await engine.createChallenge(pwItem.id, 'copy');
    const copyResult2 = await engine.verify(copyChallenge2.challengeId, passkey[copyChallenge2.index]);
    expect(copyResult2.ok).toBe(true);
    if (copyResult2.ok) {
      expect(engine.consumeGrant(copyResult2.grant.grantId, pwItem.id, 'copy')).toBe(true);
      expect(engine.consumeGrant(copyResult2.grant.grantId, pwItem.id, 'copy')).toBe(false);
    }

    // Valid 'edit' grant succeeds once for matching (itemId, 'edit')
    const editChallenge = await engine.createChallenge(pwItem.id, 'edit');
    const editResult = await engine.verify(editChallenge.challengeId, passkey[editChallenge.index]);
    expect(editResult.ok).toBe(true);
    if (editResult.ok) {
      expect(engine.consumeGrant(editResult.grant.grantId, pwItem.id, 'edit')).toBe(true);
      expect(engine.consumeGrant(editResult.grant.grantId, pwItem.id, 'edit')).toBe(false);
    }
  });
});
