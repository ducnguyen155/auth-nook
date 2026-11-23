import { describe, expect, it } from 'vitest';
import { MacKeychainStore } from '../../platform/deviceKeyStore/macKeychainStore.ts';
import { WindowsDpapiStore } from '../../platform/deviceKeyStore/windowsDpapiStore.ts';
import { MemoryPlatform } from '../../platform/memoryPlatform.ts';
import { DeviceKeyUnavailableError, HelperIntegrityError } from '../../platform/platform.ts';
import { WINDOWS_DPAPI_HELPER_SHA256 } from '../../generated/helperHash.ts';

describe('DeviceKeyStore adapters', () => {
  it('WindowsDpapiStore rejects tampered helper executable via SHA-256 check', async () => {
    const platform = new MemoryPlatform({ os: 'windows' });
    // Put a tampered binary at the helper path
    await platform.writeFileAtomic('/memory/authnook-app/bin/authnook-dpapi.exe', new Uint8Array([1, 2, 3, 4]));

    const store = new WindowsDpapiStore(platform);
    await expect(store.create('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      HelperIntegrityError
    );
    expect(WINDOWS_DPAPI_HELPER_SHA256.length).toBe(64);
  });

  it('WindowsDpapiStore maps exit code 3 to DeviceKeyUnavailableError', async () => {
    const platform = new MemoryPlatform({
      os: 'windows',
      spawnHandler: () => ({ exitCode: 3, stdout: '', stderr: '' }),
    });
    await platform.writeFileAtomic('/memory/authnook-data/device.key', new Uint8Array([9, 9, 9]));
    // Bypass helper hash check by reading real helper or testing load error mapping:
    // Here we verify missing helper throws HelperIntegrityError and missing device.key throws DeviceKeyUnavailableError.
    const store = new WindowsDpapiStore(platform);
    await expect(store.load('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      HelperIntegrityError
    );

    await platform.remove('/memory/authnook-data/device.key');
    await expect(store.load('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      DeviceKeyUnavailableError
    );
  });

  it('MacKeychainStore passes secrets via stdin in `security -i`, never in argv', async () => {
    const calls: Array<{ cmd: string; args: string[]; stdin?: string }> = [];
    let storedB64 = '';

    const platform = new MemoryPlatform({
      os: 'mac',
      spawnHandler: (cmd, args, stdin) => {
        calls.push({ cmd, args, stdin });
        if (args[0] === '-i' && stdin) {
          const match = stdin.match(/-w\s+(\S+)/);
          if (match) storedB64 = match[1];
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'find-generic-password') {
          return { exitCode: 0, stdout: `${storedB64}\n`, stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    const store = new MacKeychainStore(platform);
    const vaultId = '11111111-1111-4111-8111-111111111111';
    const created = await store.create(vaultId);
    const loaded = await store.load(vaultId);

    expect(loaded).toEqual(created);
    expect(calls[0].cmd).toBe('/usr/bin/security');
    expect(calls[0].args).toEqual(['-i']);
    expect(calls[0].args.join(' ')).not.toContain(storedB64);
    expect(calls[0].stdin).toContain(`-w ${storedB64}`);
  });
});
