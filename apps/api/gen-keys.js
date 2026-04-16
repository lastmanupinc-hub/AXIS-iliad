const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
console.log('JWT_PRIVATE_KEY=' + privateKey.export({ type: 'pkcs1', format: 'pem' }).replace(/\n/g, '\\n'));
console.log('JWT_PUBLIC_KEY=' + publicKey.export({ type: 'pkcs1', format: 'pem' }).replace(/\n/g, '\\n'));