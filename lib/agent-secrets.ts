import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
    const authSecret = process.env.BETTER_AUTH_SECRET;
    if (!authSecret)
        throw new Error("BETTER_AUTH_SECRET is required to encrypt agent API credentials.");
    return createHash("sha256").update(`aiforce-agent-api-key:v1:${authSecret}`).digest();
}

export function encryptAgentApiKey(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptAgentApiKey(value: string) {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext)
        throw new Error("Invalid stored credential.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
    ]).toString("utf8");
}
