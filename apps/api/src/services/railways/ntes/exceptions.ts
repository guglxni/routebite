export class NTESError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NTESError';
  }
}

export class NTESCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NTESCryptoError';
  }
}
