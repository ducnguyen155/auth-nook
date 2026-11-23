export interface DeviceKeyStore {
  isSupported(): boolean;
  create(vaultId: string): Promise<Uint8Array>;
  load(vaultId: string): Promise<Uint8Array>;
  destroy(vaultId: string): Promise<void>;
}
