const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync('private-key.pem', privateKey);
fs.writeFileSync('public-key.pem', publicKey);

console.log('✅ Keys generated successfully!');
console.log('private-key.pem  →  (keep secret, add to .gitignore)');
console.log('public-key.pem   →  (safe to commit)');
