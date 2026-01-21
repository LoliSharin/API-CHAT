const { constants, publicEncrypt, randomBytes } = require('crypto');

const publicKeyPem = process.env.RSA_KEK_PUBLIC_KEY_PEM;
if (!publicKeyPem) {
  console.error('RSA_KEK_PUBLIC_KEY_PEM is required');
  process.exit(1);
}

const pem = publicKeyPem.includes('\\n') ? publicKeyPem.replace(/\\n/g, '\n') : publicKeyPem;
const kek = randomBytes(32);
const wrapped = publicEncrypt(
  {
    key: pem,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  },
  kek,
);

process.stdout.write(`MASTER_KEK_WRAPPED_B64=${wrapped.toString('base64')}\n`);
