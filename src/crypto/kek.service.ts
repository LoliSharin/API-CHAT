import { Injectable } from '@nestjs/common';
import { constants, privateDecrypt } from 'crypto';

@Injectable()
export class KekService {
  private readonly kek: Buffer;
  private readonly keyId: string | null;

  constructor() {
    const wrappedB64 = process.env.MASTER_KEK_WRAPPED_B64;
    const privateKeyPem = process.env.RSA_KEK_PRIVATE_KEY_PEM;

    if (!wrappedB64) throw new Error('MASTER_KEK_WRAPPED_B64 is required');
    if (!privateKeyPem) throw new Error('RSA_KEK_PRIVATE_KEY_PEM is required');

    const wrapped = Buffer.from(wrappedB64, 'base64');
    const pem = this.normalizePem(privateKeyPem);

    const kek = privateDecrypt(
      {
        key: pem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      wrapped,
    );

    if (kek.length !== 32) {
      throw new Error('KEK must be 32 bytes after RSA unwrap');
    }

    this.kek = kek;
    this.keyId = process.env.RSA_KEK_KEY_ID ?? null;
  }

  getKek(): Buffer {
    return this.kek;
  }

  getKeyId(): string | null {
    return this.keyId;
  }

  private normalizePem(pem: string): string {
    return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  }
}
