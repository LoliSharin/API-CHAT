import { Injectable } from '@nestjs/common';
import {createCipheriv, createDecipheriv, randomBytes } from 'crypto';
type EncryptedPayload = {
  iv_b64: string;
  tag_b64: string;
  ciphertext_b64: string;
};
@Injectable()
export class CryptoService {
  encryptBytes(plaintext: Buffer, dek: Buffer, aad: string) {
    if (dek.length !== 32) throw new Error("DEK должен быть 32 битным (AES-256)");

    const iv = randomBytes(12); 
    const cipher = createCipheriv("aes-256-gcm", dek, iv);

    cipher.setAAD(Buffer.from(aad, "utf8"));

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return { ciphertext, iv, tag };
  }

  decryptBytes(ciphertext: Buffer, dek: Buffer, aad: string, iv: Buffer, tag: Buffer) {
    if (dek.length !== 32) throw new Error("DEK должен быть 32 битным (AES-256)");

    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
