export async function encodedSha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
}
