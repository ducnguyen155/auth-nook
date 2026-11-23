import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const distNeuDir = join(root, 'dist', 'AuthNook');
const appDir = join(root, 'release', 'AuthNook-mac-universal', 'AuthNook.app');
const contentsDir = join(appDir, 'Contents');
const macOsDir = join(contentsDir, 'MacOS');
const resourcesDir = join(contentsDir, 'Resources');

const macBin = join(distNeuDir, 'AuthNook-mac_universal');
const resourcesNeu = join(distNeuDir, 'resources.neu');

if (!existsSync(macBin) || !existsSync(resourcesNeu)) {
  throw new Error('Missing Neutralino release build. Run "npm run build" first.');
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(macOsDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

cpSync(macBin, join(macOsDir, 'AuthNook'));
cpSync(resourcesNeu, join(resourcesDir, 'resources.neu'));

try {
  chmodSync(join(macOsDir, 'AuthNook'), 0o755);
} catch {
  // chmod is a no-op on Windows NTFS; macOS users may need `chmod +x` if extracted with a tool that drops permissions.
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>AuthNook</string>
  <key>CFBundleDisplayName</key>
  <string>AuthNook</string>
  <key>CFBundleIdentifier</key>
  <string>app.authnook.desktop</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>AuthNook</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

writeFileSync(join(contentsDir, 'Info.plist'), plist, 'utf8');

console.log(`Packaged unsigned macOS app bundle: ${appDir}`);
