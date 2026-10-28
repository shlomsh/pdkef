// An export that failed on a protected PDF (Redact ENC-02, Sign ENC-07): pdf-lib names the error
// EncryptedPDFError, and a minified build may leave only its message.
export function isEncryptedPdfError(err: unknown): boolean {
  const name = Reflect.get(Object(err), 'name');
  const message = String(Reflect.get(Object(err), 'message') ?? '');
  return name === 'EncryptedPDFError' || message.includes('is encrypted');
}
