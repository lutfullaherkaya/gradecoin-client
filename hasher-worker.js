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
    blockRequest.nonce = workerData.workerIndex;
    do {
        blockRequest.nonce += workerData.workerCount;
        serilestirilmis = JSON.stringify(blockRequest, ['transaction_list', 'nonce', 'timestamp']);
        hash = blake2.createHash('blake2s').update(Buffer.from(serilestirilmis)).digest("hex");
    } while (hash.slice(0, workerData.hash_zeros) !== '0'.repeat(workerData.hash_zeros));
    blockRequest.hash = hash;
}

nonceBul(workerData.block);
parentPort.postMessage(workerData.block);