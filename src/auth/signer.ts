import { KeyManagementServiceClient } from '@google-cloud/kms';
import { ClientOptions } from 'google-gax';
import { parseSignature, parsePublicKey } from '../util/asn1-parser';
import { google } from '@google-cloud/kms/build/protos/protos';
import * as rlp from '@onflow/rlp';

/**
 * Contains functions that are used to call and process GCP KMS Client message signing and key fetching.
 */
export class Signer {
  private readonly client: KeyManagementServiceClient;
  private readonly resourceId: string;

  /**
   * Creates a new Signer instance
   * @param resourceId Google KMS Client resourceId
   * @param clientOptions Google KMS Client Options
   */
  public constructor(resourceId: string, clientOptions?: ClientOptions) {
    this.client = new KeyManagementServiceClient(clientOptions);
    // Create clnet.cryptoKeyVersion String full resource Id
    this.resourceId = resourceId;
  }

  /**
   * Fetches public key from the GCP KMS Client and asn1 decodes it.
   * @returns a promise string public key in raw hex format
   */
  public async getPublicKey(): Promise<string | undefined> {
    const asn1PublicKey = await this._getPublicKey();
    const publicKey = parsePublicKey(asn1PublicKey);
    return publicKey?.toString('hex').replace(/^04/, '');
  }

  /**
   * Hashes message using SHA2_256
   * @param message message to be hashed
   * @returns message sha digest
   */
  private _hashMessage(message: string): Buffer {
    var crypto = require('crypto');
    const sha = crypto.createHash('sha256');
    sha.update(Buffer.from(message, 'hex'));
    return sha.digest();
  }

  /**
   * Fetches public key from google client
   * @returns returns google client public key
   */
  private async _getPublicKey(): Promise<google.cloud.kms.v1.IPublicKey> {
    const [publicKey] = await this.client.getPublicKey({
      name: this.resourceId,
    });

    // For more details on ensuring E2E in-transit integrity to and from Cloud KMS visit:
    // https://cloud.google.com/kms/docs/data-integrity-guidelines
    var crc32c = require('fast-crc32c');
    if (publicKey.name !== this.resourceId) {
      throw new Error('GetPublicKey: request corrupted in-transit');
    }
    if (
      crc32c.calculate(publicKey.pem) !== Number(publicKey.pemCrc32c?.value)
    ) {
      throw new Error('GetPublicKey: response corrupted in-transit');
    }
    return publicKey;
  }

  /**
   * Signs message using GCP KMS Client and parses the signature
   * @param message message to be signed
   * @returns hex encoded signed message string
   */
  public async sign(message: string): Promise<string | undefined> {
    const digest = this._hashMessage(message);
    const asn1Signature = await this._sign(digest);
    if (asn1Signature) {
      const { r, s } = parseSignature(asn1Signature);
      return Buffer.concat([r, s]).toString('hex');
    }
    return undefined;
  }

  public async getFlowPublicKey(): Promise<string | undefined> {
    const asn1PublicKey = await this._getPublicKey();
    const publicKey = parsePublicKey(asn1PublicKey);
    if (publicKey)
      // ref. https://github.com/onflow/flow/blob/f678a4/docs/content/concepts/accounts-and-keys.md#supported-signature--hash-algorithms
      return rlp
        .encode([
          Buffer.from(publicKey.toString('hex'), 'hex'),
          2, // Signature Algorithm: ECDSA_P256
          1, // Hash Algorithm: SHA2_256
          1000, // Weight
        ])
        .toString('hex');
    return undefined;
  }

  /**
   * Signs message digest using GCP KMS Client
   * @param digest sha message digest
   * @returns signResponse Buffer
   */
  private async _sign(digest: Buffer): Promise<Buffer | undefined> {
    var crc32c = require('fast-crc32c');
    const digestCrc32c = crc32c.calculate(digest);
    const [signResponse] = await this.client.asymmetricSign({
      name: this.resourceId,
      digest: {
        sha256: digest,
      },
      digestCrc32c: {
        value: digestCrc32c,
      },
    });

    // Optional, but recommended: perform integrity verification on signResponse.
    // For more details on ensuring E2E in-transit integrity to and from Cloud KMS visit:
    // https://cloud.google.com/kms/docs/data-integrity-guidelines
    if (signResponse.name !== this.resourceId) {
      throw new Error('AsymmetricSign: request corrupted in-transit');
    }
    if (!signResponse.verifiedDigestCrc32c) {
      throw new Error('AsymmetricSign: request corrupted in-transit');
    }
    if (
      crc32c.calculate(signResponse.signature) !==
      Number(signResponse.signatureCrc32c?.value)
    ) {
      throw new Error('AsymmetricSign: response corrupted in-transit');
    }

    if (signResponse.signature) return Buffer.from(signResponse.signature);
    return undefined;
  }
}
