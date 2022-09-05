# GCP KMS Flow Authorizer

A Google Cloud Platform Key Management System Flow Blockchain Authorizer. This library can be used to create a Flow authorization function by using the Google KMS signing function.

> Forked from: https://github.com/lukaracki/fcl-kms-gcp-authorizer

To use this library, the following steps have to be completed:

1. [Installation](https://github.com/EurekaDAO/GCP-KMS-Flow-Authorizer/#installation)
2. [GCP KMS Setup](https://github.com/EurekaDAO/GCP-KMS-Flow-Authorizer/#GCP-KMS-Setup)
3. [Flow Account Creation using **_GCP KMS Raw Hex Key_**](https://github.com/EurekaDAO/GCP-KMS-Flow-Authorizer/#flow-account-creation)

When you've completed the steps above you can use this library to sign transactions from the created Flow account using the key you've set up via GCP KMS.

## Installation

```bash
$ npm install gcp-kms-flow-authorizer
```

## GCP KMS Setup

This library uses **_ECDSA_P256_, _SHA2_256_** based keys. You need to generate a key in the GCP KMS with the following settings:

- Protection level: Software
- Purpose: Asymmetric sign
- Default algorithm: **_Elliptic Curve P-256 key, SHA256 Digest_**

> Google Cloud Documentation for Creating Keys: https://cloud.google.com/kms/docs/creating-asymmetric-keys

After creating your key, you need to get the key's resource name. The resource name is used to create an authorizer instance, see the example file [send-tx.ts](https://github.com/EurekaDAO/GCP-KMS-Flow-Authorizer/blob/main/examples/send-tx.ts).

```ts
const resourceId: string = { yourResourceName };
// e.g -> 'projects/your-project-name/locations/global/keyRings/flow/cryptoKeys/flow-minter-key'
const authorizer = new GcpKmsAuthorizer(resourceId);
```

Using the @google-cloud/kms library requires authentication with google. It is recommended to use an environment variable to set up the authentication using a google account authentication JSON file. This variable only applies to your current shell session, so if you open a new session, set the variable again.

```bash
$ export GOOGLE_APPLICATION_CREDENTIALS= "PATH"
# -> PATH = /home/user/Downloads/service-account-file.json
```

> Google Cloud Documentation for authentication: https://cloud.google.com/docs/authentication/getting-started

## Flow Account Creation

To create an account on the flow blockchain you need to specify a 128 hexadecimal public key. There are several ways to create an account. For details, please refer to Flow documentation.

- Using Flow CLI
  - Ref: https://docs.onflow.org/flow-cli/create-accounts
- Using Flow Testnet Faucet (for Testnet)
  - Ref: https://docs.onflow.org/dapp-deployment/testnet-deployment#creating-an-account
- Using Flow Go SDK
  - Ref: https://docs.onflow.org/flow-go-sdk/creating-accounts
- Using Flow JavaScript SDK

To obtain the public key needed to create an account, you can use the getPublicKey() method which returns a 128 character hexadecimal string.

```ts
// Get the public key
const publicKey = await authorizer.getPublicKey();

// -> e.g. ee3df35fdb6aaa1e84ee27c2cb9dd98b57d951b74b64fef13a70b9ce2ac659b1a41f0f352824e2c1a3622d44db417e02192b49285de
```

An example of creating an account using Flow CLI is shown below (**using _SHA2_256_ hash algorithm**):

```
$ flow accounts create \
      --key ee3df35fdb6aaa1e84ee27c2cb9dd98b57d951b74b64fef13a70b9ce2ac659b1a41f0f352824e2c1a3622d44db417e02192b49285de5dee3c90ad612b990447c \
      --hash-algo SHA2_256
```

## Examples

See [send-tx.ts](https://github.com/EurekaDAO/GCP-KMS-Flow-Authorizer/blob/main/examples/send-tx.ts).

```ts
import { GcpKmsAuthorizer } from '../src/auth/authorizer';

import * as fcl from '@onflow/fcl';

// emulator url
const apiUrl = 'http://localhost:8080';

fcl.config().put('accessNode.api', apiUrl);

async function main() {
  // Your GCP resourceId
  const resourceId: string =
    'projects/your-project-id/locations/global/keyRings/flow/cryptoKeys/flow-minter-key/cryptoKeyVersions/1';

  // Your account key (emulator or testnet)
  // Create account first using flow accounts create --key {yourRawHexPublicKey}
  const address = '0x01cf0e2f2f715450';
  const keyIndex = 0;

  const authorizer = new GcpKmsAuthorizer(resourceId);

  const authorization = authorizer.authorize(address, keyIndex);

  const response = await fcl.send([
    fcl.transaction`
      transaction {
        prepare(signer: AuthAccount) {
          log("Test transaction signed by fcl-gcp-kms-authorizer")
        }
      }
    `,
    fcl.args([]),
    fcl.proposer(authorization),
    fcl.authorizations([authorization]),
    fcl.payer(authorization),
    fcl.limit(9999),
  ]);

  console.log('=====Transaction Succeeded=====\n');

  const publicKey = await authorizer.getPublicKey();

  const flowPublicKey = await authorizer.getFlowPublicKey();

  console.log('\nFetched Raw Hex Public Key: ' + publicKey);

  console.log('\nFetched Flow Public Key: ' + flowPublicKey + '\n');
}

main().catch(e => console.error(e));
```

## Security Caveats

> This library is designed for backend or administrative frontend use; be careful not to expose your GCP access information to users.
> With the asymmetric keys in GCP KMS, no one can steal your private key. However, please be careful not to disclose the access to the signing function to anyone.

## Credits

Based on the GCP KMS version by @lukaracki, updated to work with modern versions of FCL.
