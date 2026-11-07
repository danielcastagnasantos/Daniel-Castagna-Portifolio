import "server-only";
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // sem caracteres ambíguos (0/O, 1/l/I)

/** Senha provisória aleatória (CSPRNG), legível para ser ditada/anotada. */
export function generateTempPassword(len = 12): string {
  return Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
