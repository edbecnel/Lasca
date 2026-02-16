import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

function pbkdf2Async(
  password: string,
  salt: Buffer,
  iterations: number,
  keylen: number,
  digest: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

export type PasswordHash = {
  algo: "pbkdf2";
  /** Random salt, hex. */
  saltHex: string;
  /** Derived key, hex. */
  hashHex: string;
  /** PBKDF2 iterations. */
  iterations: number;
  /** Digest algorithm. */
  digest: "sha256";
  /** Derived key length. */
  dkLen: number;
};

const DEFAULT_PARAMS = {
  iterations: 120_000,
  digest: "sha256" as const,
  dkLen: 32,
} as const;

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(
    password,
    salt,
    DEFAULT_PARAMS.iterations,
    DEFAULT_PARAMS.dkLen,
    DEFAULT_PARAMS.digest
  );

  return {
    algo: "pbkdf2",
    saltHex: salt.toString("hex"),
    hashHex: derived.toString("hex"),
    iterations: DEFAULT_PARAMS.iterations,
    digest: DEFAULT_PARAMS.digest,
    dkLen: DEFAULT_PARAMS.dkLen,
  };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (!stored || stored.algo !== "pbkdf2") return false;

  const salt = Buffer.from(stored.saltHex, "hex");
  const expected = Buffer.from(stored.hashHex, "hex");

  const derived = await pbkdf2Async(password, salt, stored.iterations, stored.dkLen, stored.digest);

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
