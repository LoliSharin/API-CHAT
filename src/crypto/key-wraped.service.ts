import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export type WrappedKeyPayload = {
  wrapped_key_b64: string;
  wrap_iv_b64: string;
  wrap_tag_b64: string;
};

@Injectable()
export class KeyWrappingService {
  wrapKey(dek: Buffer, kek: Buffer, aad: string): WrappedKeyPayload {
    if (kek.length !== 32) throw new Error("KEK must be 32 bytes (AES-256)");
    if (dek.length !== 32) throw new Error("DEK must be 32 bytes (AES-256)");

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));

    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      wrapped_key_b64: wrapped.toString("base64"),
      wrap_iv_b64: iv.toString("base64"),
      wrap_tag_b64: tag.toString("base64"),
    };
  }

  unwrapKey(payload: WrappedKeyPayload, kek: Buffer, aad: string): Buffer {
    if (kek.length !== 32) throw new Error("KEK must be 32 bytes (AES-256)");

    const iv = Buffer.from(payload.wrap_iv_b64, "base64");
    const tag = Buffer.from(payload.wrap_tag_b64, "base64");
    const wrapped = Buffer.from(payload.wrapped_key_b64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", kek, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  }
}
