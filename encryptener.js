// https://stackoverflow.com/questions/50701311/node-js-crypto-whats-the-default-padding-for-aes
// node js seems to use pkcs7 padding by default

//AES 128 Encryption Demo Program https://www.knowledgefactory.net/2021/06/nodejs-aes-encryption-and-decryption.html
// crypto module
const http = require('http');
const crypto = require("crypto");
const fs = require('fs');
const P_AR = {
    "student_id": "e244836",
    "passwd": "SGz6IsBccetaFr2NxjPbxCAqZnOIZm6Y",
    "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQB7gORvRMWjcFy9Aw5oyWil\nCgZw7bd2mr0v0hNnTKYbMb0Mn3PGAooSpyo8A1wqf7m/Gc9v2zK4CNI5ugnM9jsS\nlGDenb005hBBNT+jKmRt4wS/+aw04/VKy9w4+wlRLPWNEuHbkGJ9noEeQdHosdyn\nftmR0p02pEqhAvtIel2XAwxFzwHkAZg1M1Pl65dTvWy7+iGXt9BFxBMFonJ1UuY9\nXyEPpVO66bBrYQLZaGymCBGuAjl92RjlSksGImxVGcGPzIQ684ZQpYg4B9eVNNnP\nDUS52RcdJH4LdPVURwX4vnnvkLZ5KyNEeWbwDjoNKzHSH5zH/GUxTfNKJrLxnbJx\nAgMBAAE=\n-----END PUBLIC KEY-----"
}

// istek atma
//https://reqbin.com/

// encrypt the message
function encrypt(plainText, securitykey, outputEncoding, ivKey) {
    const cipher = crypto.createCipheriv("aes-128-cbc", securitykey, ivKey);
    return Buffer.concat([cipher.update(plainText), cipher.final()]).toString(outputEncoding);
}

//AES decryption
function decrypt(cipherText, securitykey, outputEncoding, ivKey) {
    const cipher = crypto.createDecipheriv("aes-128-cbc", securitykey, ivKey);
    return Buffer.concat([cipher.update(cipherText), cipher.final()]).toString(outputEncoding);
}


// secret key generate 16 bytes of random data
const k_temp = crypto.randomBytes(16);
const iv = crypto.randomBytes(16);
console.log('k_temp:', k_temp.toString('hex'));
console.log('iv:', iv.toString('hex'));
console.log('');

// protected data
const secretMessage = JSON.stringify(P_AR);

//AES encryption Encrypt the serialized string of P_AR with 128 bit block AES in CBC mode with Pkcs7 padding using the temporary key (k_temp), the result is C_AR. Encode this with base64.
const encrypted =
    encrypt(secretMessage, k_temp, "base64", iv);
console.log("Encrypted message:", encrypted);
console.log('');

//AES decryption
const decrypted = decrypt(Buffer.from(encrypted, "base64"), k_temp, "utf8", iv)
console.log("Decrypted string:", decrypted);
console.log('');

const C_AR = encrypted;

// The temporary key you have picked k_temp is encrypted using RSA with OAEP padding scheme using SHA-256 with gradecoin_public_key, giving us key_ciphertext. Encode this with base64.
// https://www.sohamkamani.com/nodejs/rsa-encryption/


const publicKey = fs.readFileSync('gradecoin.pub', "utf8");
const encryptedData = crypto.publicEncrypt(
    {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
    },
    // We convert the data string to a buffer using `Buffer.from`
    k_temp
);

// The encrypted data is in the form of bytes, so we print it in base64 format
// so that it's displayed in a more readable form
console.log("key_ciphertext:");
console.log(encryptedData.toString("base64"));
console.log(encryptedData.toString("hex"));
console.log(encryptedData);
console.log('');
console.log('iv:');
console.log(iv.toString('base64'));
console.log(iv.toString('hex'));
console.log(iv);

const auth_request = {
    "c": C_AR,
    "iv": iv.toString('base64'),
    "key": encryptedData.toString("base64")
}

console.log(JSON.stringify(auth_request, null, 2)) ;