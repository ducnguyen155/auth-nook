import jsQR from 'jsqr';
import { parseOtpAuthUri, type ParsedOtpAuthUri } from './otpauthUri.ts';

/**
 * Decodes an `otpauth://totp/...` QR code from an image Blob or File using an
 * offscreen HTML canvas and jsQR.
 */
export async function decodeTotpQrFromBlob(blob: Blob): Promise<ParsedOtpAuthUri> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D canvas context.');
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (!result || !result.data) {
      throw new Error('No QR code found in the selected image.');
    }
    return parseOtpAuthUri(result.data);
  } finally {
    bitmap.close();
  }
}
