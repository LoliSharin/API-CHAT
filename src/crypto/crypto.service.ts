import { Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt } from 'crypto';

@Injectable()
export class CryptoService {
  private privateKeyPem: string;
  private publicKeyPem: string;

  constructor() {
    const priv = process.env.CHAT_PRIVATE_KEY;
    const pub = process.env.CHAT_PUBLIC_KEY;
    // Для разработки можно оставить пустым, но в проде ключи обязательны
    this.privateKeyPem = priv ? priv.replace(/\\n/g, '\n') : '';
    this.publicKeyPem = pub ? pub.replace(/\\n/g, '\n') : '';
  }

  getPublicKey() {
    return this.publicKeyPem;
  }

  encryptWithPublic(data: Buffer | string) {
    if (!this.publicKeyPem) throw new Error('Public key not set');
    const key = createPublicKey(this.publicKeyPem);
    return publicEncrypt(key, Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  decryptWithPrivate(data: Buffer) {
    if (!this.privateKeyPem) throw new Error('Private key not set');
    const key = createPrivateKey(this.privateKeyPem);
    return privateDecrypt(key, data);
  }
}
