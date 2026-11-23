# AuthNook

**Passwords & Authentication. Simplified.**

AuthNook is a lightweight, local-first desktop application for managing passwords and 6-digit TOTP authenticator codes. It runs completely offline with no accounts, no backend, and no cloud sync.

## Features

- **Password Manager:** Add, edit, search, and organize credentials with categories and tags, plus a built-in CSPRNG password generator.
- **Authenticator (TOTP):** Import accounts via QR code (file, drag-and-drop, or clipboard paste) or manual Base32 secret key, with live countdown timers.
- **Static Code Composition:** Optionally attach an encrypted static code (e.g. `AAA`) per authenticator account so copying produces `AAA123456` (configurable prefix/suffix and separator).
- **Protected Reveal (Anti-Shoulder-Surfing):** Passwords and OTP codes are hidden by default. Showing, copying, or editing a password or OTP requires verifying a single random character from your Passkey (`4–8` digits). Challenges are single-use, never store plaintext Passkeys, auto-hide after reveal, and lock the vault after 3 consecutive failed attempts.
- **Local Encryption & Device Binding:**
  - Key derivation with **Argon2id** (`64 MiB`, `3` iterations) and authenticated encryption with **XChaCha20-Poly1305**.
  - Optional **Device Binding** stores a 32-byte Device Secret in the OS secure store (Windows DPAPI `CurrentUser` via a minimal verified helper, or macOS login Keychain via `/usr/bin/security`), preventing vault decryption if copied to another machine or OS user.
- **Security Controls:** Idle auto-lock, optional lock-on-blur, automatic clipboard clearing, and device-independent encrypted `.authnook` backups for cross-platform recovery.

## Technology Stack

- **Desktop Shell:** Neutralinojs (system WebView2 on Windows, WKWebView on macOS)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand
- **Database:** SQLite via `sql.js` (WASM) with atomic file writes
- **Cryptography:** `hash-wasm` (Argon2id), `@noble/ciphers` (XChaCha20-Poly1305), `@noble/hashes` (HKDF, HMAC-SHA256)
- **TOTP & QR:** `otplib`, `jsQR`

## Prerequisites

- **Node.js 22+** and **npm**
- **Windows:** .NET Framework 4.x (pre-installed on Windows 10/11, provides `csc.exe` to compile the 4.5 KB DPAPI helper) and WebView2 Runtime.
- **macOS:** macOS 12+ (uses built-in WKWebView and `/usr/bin/security`).

## Development

```bash
# Install dependencies
npm install

# Build the Windows DPAPI helper (Windows only)
npm run build:helper

# Download Neutralinojs binaries
npx neu update

# Run automated tests and typecheck
npm run typecheck
npm test

# Start Vite dev server (browser preview mode)
npm run dev
```

To run the full desktop window in development:

```bash
# Terminal 1
npm run dev

# Terminal 2
npx neu run --frontend-lib-dev
```

## Production Build & Packaging

```bash
npm run build:helper
npm run build
npm run package:win   # Outputs release/AuthNook-win-x64/ and .zip
npm run package:mac   # Outputs unsigned release/AuthNook-mac-universal/AuthNook.app
```

> **Note on Unsigned Builds:** Windows SmartScreen and macOS Gatekeeper will warn on unsigned binaries. On macOS, right-click `AuthNook.app` and choose **Open** (or allow it in *System Settings → Privacy & Security*).

## Security Notes

- If **Device Binding** is enabled, reinstalling your OS, resetting your user account, or switching machines will make the local vault unrecoverable without an encrypted `.authnook` backup. Always keep a current backup stored safely.
- Production builds strip `console.*` and `debugger` statements and disable Neutralino's inspector and log files.

## License

MIT License — see [LICENSE](./LICENSE).
