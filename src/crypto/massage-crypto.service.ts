import { Injectable } from '@nestjs/common';
import {createCipheriv, createDecipheriv, randomBytes } from 'crypto';
type EncryptedPayload = {
  iv_b64: string;
  tag_b64: string;
  ciphertext_b64: string;
};
@Injectable()
export class CryptoService {
  encrypt(plaintext: string, dek: Buffer, aad: string): EncryptedPayload {
    if (dek.length !== 32) throw new Error("DEK не имеет 32 бит для AES-256-GCM");

    const iv = randomBytes(12); // 96-bit стандарт для GCM
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag(); // 16 дефолтный 
    return {
      iv_b64: iv.toString("base64"),
      tag_b64: tag.toString("base64"),
      ciphertext_b64: ciphertext.toString("base64"),
    };
  }

  decrypt(payload: EncryptedPayload, dek: Buffer, aad: string): string {
    if (dek.length !== 32) throw new Error("DEK не имеет 32 бит для AES-256-GCM");

    const iv = Buffer.from(payload.iv_b64, "base64");
    const tag = Buffer.from(payload.tag_b64, "base64");
    const ciphertext = Buffer.from(payload.ciphertext_b64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  }
}
