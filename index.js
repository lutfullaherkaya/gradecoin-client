const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require("crypto");
const blake = require('blakejs');
const blake2 = require('blake2');
const os = require('os');

const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require("worker_threads");

const PARMAK_IZI = '60873eeb2d28388eeba204878977d0a73598745fc9357f196c579660924075d6';

class Istemci {
    constructor(ozelAnahtar, parmakIzi, config) {
        this.ozelAnahtar = ozelAnahtar;
        this.parmakIzi = parmakIzi;
        this.config = config;
        this.kaziSureleriSn = [];
        this.odulSayisi = 0;
        this.baslamaZamani = new Date();
    }

    url(endpoint) {
        if (this.config.url_prefix) {
            return `https://gradecoin.xyz/${this.config.url_prefix}/${endpoint}`;
        } else {
            return `https://gradecoin.xyz/${endpoint}`;
        }
    }

    static isoTurkiye() {
        const now = new Date();
        now.setHours(now.getHours() + 3);
        return now.toISOString().slice(0, -1);
    }

    static errorLogla(error) {
        if (error.response && error.response.data) {
            console.error(error.response.data);
        } else {
            console.error(error);
        }
    }

    jwtTokeniOlustur(hash = "000000ecdc24b40a82cf2deab684d4f68296f3e69d123e361afe7514a84bab82") {
        const unixTime = Math.floor(Date.now() / 1000);
        const unixTimePlus2h = unixTime + 7200;

        const jwtData = {
            tha: hash, iat: unixTime, exp: unixTimePlus2h
        }

        const token = jwt.sign(jwtData, this.ozelAnahtar, {algorithm: 'RS256', allowInsecureKeySizes: true});

        return token;
    }

    async gerekliyseBotaAsgariOde() {
        const botParmakIzleri = [
            '5dcdedc9a04ea6950153c9279d0f8c1ac9528ee8cdf5cd912bebcf7764b3f9db',
            '4319647f2ad81e83bf602692b32a082a6120c070b6fd4a1dbc589f16d37cbe1d',
            'f44f83688b33213c639bc16f9c167543568d4173d5f4fc7eb1256f6c7bb23b26',
            'a4d9a38a04d0aa7de7c29fef061a1a539e6a192ef75ea9730aff49f9bb029f99',
            // rest is not bots but regular people with more than 100 coins for keeping the game going
            'c1da3dcc9d08f7e820ad2ecae77232f5f8a6e508b46e939008e55a2947e150a1',
            '98179554a7c283072c6c3bf3b7444664e3d4af7d76bd3a1341430a0af3b166c7',
            '1bf6590a4a85b5bb8fab61e5c028b7d8a305e33d4ef60e067f74561620ba6b8a',
            '6ac5ef1e3de7984c5300ad3855de8a92cb86d7b2c804d7c7c1ef914141af2a62',
            'e5ed590ed68523b68a869b74564d824f56728d8b29af8dd4dcf1049dfa93c2e2',
            '52ceed61903d085528d86cee3842028f93d216f3d5d240d2b50d8093a3dd69fb',

        ];
        try {
            const islemler = Object.values((await axios.get(this.url('transaction'))).data);
            const kendiIslemlerim = islemler.filter(islem => islem.source === this.parmakIzi);
            console.log(`Oyun aksın diye botlara ve oyunu bitirenlere asgari ödeme yapılıyor.`);
            const odenecekKisiler = [];

            for (const botParmakIzi of botParmakIzleri) {
                const hedefiBuBotOlanIslemlerim = kendiIslemlerim.filter(islem => islem.target === botParmakIzi);
                if (hedefiBuBotOlanIslemlerim.length === 0) {
                    odenecekKisiler.push(botParmakIzi);
                }
            }
            await Promise.all(odenecekKisiler.map(botParmakIzi => this.ode(this.config.tx_lower_limit, botParmakIzi, false)));

            // wait 1 seconds for request finishing
            // await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            Istemci.errorLogla(error);
        }
    }

    async ode(miktar, hedef, infoLogla = true, errorLogla = true) {
        const transRequest = {
            source: this.parmakIzi, target: hedef, amount: miktar, timestamp: Istemci.isoTurkiye(),
        }
        const serilestirilmis = JSON.stringify(transRequest, ['source', 'target', 'amount', 'timestamp']);
        const hash = crypto.createHash('md5').update(serilestirilmis).digest("hex");
        if (infoLogla) {
            console.log('Ödeme yapılıyor:' + JSON.stringify(transRequest));
        }
        try {
            const cevap = (await axios.post(this.url('transaction'), transRequest, {
                headers: {Authorization: `Bearer ${this.jwtTokeniOlustur(hash)}`}
            })).data;
            if (infoLogla) {
                console.log(cevap);
            }
        } catch (error) {
            if (errorLogla) {
                Istemci.errorLogla(error);
            }
        }


    }

    async asgariIslemleriAl() {
        console.log('İlk on işlem alınıyor.');
        await this.gerekliyseBotaAsgariOde();
        let islemler = [];
        while (true) {
            try {
                islemler = [];
                const islemlerNesnesi = (await axios.get(this.url('transaction'))).data;
                for (const id in islemlerNesnesi) {
                    const islem = islemlerNesnesi[id];
                    islem.id = id;
                    islemler.push(islem);
                }
                if (islemler.length >= this.config.block_transaction_count) {
                    // sort islemler by iso timestamp descending (getting the most recent ten which we started recently)
                    islemler.sort((a, b) => {
                        const aDate = new Date(a.timestamp);
                        const bDate = new Date(b.timestamp);
                        return bDate - aDate;
                    });
                    const kendiIslemimIndeks = islemler.findIndex(islem => islem.source === this.parmakIzi);
                    if (kendiIslemimIndeks === -1) {
                        console.log('Kendi işlemim bulunamadı. Tekrar bota ödeme yapılıyor.');
                        await this.gerekliyseBotaAsgariOde();
                        continue;
                    }
                    // put kendiIslemimIndeks to the start of the array
                    islemler.unshift(islemler.splice(kendiIslemimIndeks, 1)[0]);

                    break;
                } else {
                    console.log(`İşlem sayısı ${this.config.block_transaction_count} değil ` + islemler.length + '.')
                }
            } catch (error) {
                if (error.response.data) {
                    console.error(error.response.data);
                } else {
                    console.error(error);
                }
            }
            console.log('7sn sonra tekrar denenecek.');
            await new Promise(resolve => setTimeout(resolve, 7000));


        }
        console.log(islemler.length + ' İşlem arasından son on işlem alındı.');
        return islemler.slice(0, this.config.block_transaction_count);
    }

    async kaz() {
        const islemler = await this.asgariIslemleriAl();

        const blockRequest = {
            transaction_list: islemler.map(islem => islem.id),
            nonce: 0,
            timestamp: Istemci.isoTurkiye(),
        }
        await this.beraberNonceBul(blockRequest);

        console.log(`${this.kaziSureleriSn.length}. blok kazıldı. Harcanan zaman: ` + this.kaziSureleriSn[this.kaziSureleriSn.length-1] + "sn");
        console.log("Ortalama:\t" + Istemci.mean(this.kaziSureleriSn).toFixed(3) + " sn" + "\tMedyan:\t" + Istemci.median(this.kaziSureleriSn).toFixed(3) + " sn");
        console.log("Asgari:  \t" + Math.min(...this.kaziSureleriSn).toFixed(3) + " sn" + "\tAzami:\t" + Math.max(...this.kaziSureleriSn).toFixed(3) + " sn");
        console.log("Toplam geçen zaman saniye dakika: " + this.gecenToplamZaman())
        console.log(JSON.stringify(blockRequest, ['nonce', 'timestamp', 'transaction_list']))
        try {
            console.log((await axios.post('https://gradecoin.xyz/block', blockRequest, {
                headers: {Authorization: `Bearer ${this.jwtTokeniOlustur(blockRequest.hash)}`}
            })).data);
            this.odulSayisi++;
            console.log('Kazanılan ödül: ' + this.config.block_reward + ' GradeCoin.');
            console.log('Toplam kazanılan ödül: ' + this.odulSayisi * this.config.block_reward + ' GradeCoin.');
        } catch (error) {
            Istemci.errorLogla(error);
        }
        console.log('')
    }


    nonceBul(blockRequest) {
        console.time("Tek çekirdek madenciliğe harcanan zaman");
        let serilestirilmis = '';
        let hash = '';
        do {
            blockRequest.nonce++;
            serilestirilmis = JSON.stringify(blockRequest, ['transaction_list', 'nonce', 'timestamp']);
            hash = blake2.createHash('blake2s').update(Buffer.from(serilestirilmis)).digest("hex");
        } while (hash.slice(0, this.config.hash_zeros) !== '0'.repeat(this.config.hash_zeros));
        blockRequest.hash = hash;
        console.timeEnd("Tek çekirdek madenciliğe harcanan zaman");
    }

    async beraberNonceBul(blockRequest) {
        console.log('Blok kazılıyor.')
        // calculate execution time
        const baslamaZamani = new Date();

        await new Promise((resolve, reject) => {
            const cekirdekSayisi = Math.floor(os.cpus().length / 1.5); // sanal cekirdekler icin biraz azalt
            const workers = [];
            for (let i = 0; i < cekirdekSayisi; i++) {
                const worker = new Worker(__dirname + "/hasher-worker.js", {
                    workerData: {
                        block: blockRequest,
                        workerIndex: i,
                        workerCount: cekirdekSayisi,
                        hash_zeros: this.config.hash_zeros,
                    },
                });
                workers.push(worker);
                worker.on("message", msg => {
                    blockRequest.nonce = msg.nonce;
                    blockRequest.hash = msg.hash;
                    for (const worker of workers) {
                        worker.terminate();
                    }
                    resolve();
                });
            }
        })
        const bitisZamaniSn = (new Date() - baslamaZamani) / 1000;
        this.kaziSureleriSn.push(bitisZamaniSn);


    }

    static median(values) {
        values.sort((a, b) => a - b);
        const half = Math.floor(values.length / 2);
        if (values.length % 2) {
            return values[half];
        }
        return (values[half - 1] + values[half]) / 2.0;
    }

    static mean(values) {
        return values.reduce((a, b) => a + b) / values.length;
    }

    gecenToplamZaman() {
        const now = new Date();
        const elapsedTime = now - this.baslamaZamani;
        const elapsedTimeInHours = Math.floor(elapsedTime / 1000 / 60 / 60);
        const elapsedTimeInMinutes = Math.floor((elapsedTime - elapsedTimeInHours * 1000 * 60 * 60) / 1000 / 60);
        const elapsedTimeInSeconds = Math.floor((elapsedTime - elapsedTimeInHours * 1000 * 60 * 60 - elapsedTimeInMinutes * 1000 * 60) / 1000);
        return `${elapsedTimeInHours} saat ${elapsedTimeInMinutes} dakika ${elapsedTimeInSeconds} saniye`;


    }


}

async function main() {
    const ozelAnahtar = fs.readFileSync('2048-bit-rsa-private.txt', "utf8");
    const config = (await axios.get('https://gradecoin.xyz/config')).data;

    const istemci = new Istemci(ozelAnahtar, PARMAK_IZI, config);


    while (true) {
        await istemci.kaz();
    }


}


main();

// bir blok 13 saniye suruyor ortalama
// dakikada 14 coin


