const blake2 = require('blake2');

const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require("worker_threads");

function nonceBul(blockRequest) {
    let serilestirilmis = '';
    let hash = '';
    let currentNonce = 1_000_000_000 + workerData.workerIndex;
    const zeroes = '0'.repeat(workerData.hash_zeros);
    // 32 bit en cok 2 milyar oluyor. nonce boyle olunca json stringi uzunluğu sabit kalarak işlem hızlanıyor.
    blockRequest.nonce = currentNonce;
    serilestirilmis = JSON.stringify(blockRequest, ['transaction_list', 'nonce', 'timestamp']);

    const nonceIndex = serilestirilmis.indexOf('nonce') + 7;
    const jsonBuffer = Buffer.from(serilestirilmis);


    do {
        currentNonce += workerData.workerCount;
        let stringNonce = currentNonce.toString();
        jsonBuffer.write(stringNonce, nonceIndex, stringNonce.length);
        hash = blake2.createHash('blake2s').update(jsonBuffer).digest("hex");
    } while (hash.slice(0, workerData.hash_zeros) !== zeroes);
    blockRequest.hash = hash;
    blockRequest.nonce = currentNonce;
}

nonceBul(workerData.block);
parentPort.postMessage(workerData.block);