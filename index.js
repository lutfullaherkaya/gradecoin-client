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
            /*'602f2194a236e3100978d0c65c2e17f7253a1f221f2b6fc625f692c5df19d1d3',
            'dc6476290c9f42efe6b5bebead16cf067ca18b5b593d12e01bff656fa173eecc',
            '9d453e55cd1367ecf122fee880991e29458651f3824cd9ea47b89e06158936e3',
            '75c233939c5c1ccd03b9dccd26c52a50ade7190305970a30a0c4e17c36c58f14',
            '75cb40e1d4a5fdf3e3a8fe98a7b8b53ab3f6cd401e645b7b0e7d52b8519fb1a8',
            '85bbd17fbeaaad45aecba62fb974b1ac40eda237d3679b8f213309b32facc376',*/

        ];
        try {
            const islemler = Object.values((await axios.get(this.url('transaction'))).data);
            const kendiIslemlerim = islemler.filter(islem => islem.source === this.parmakIzi);
            console.log(`Oyun aksın diye botlara ve oyunu bitirenlere asgari ödeme yapılıyor.`);
            for (const botParmakIzi of botParmakIzleri) {
                const hedefiBuBotOlanIslemler = islemler.filter(islem => islem.target === botParmakIzi);
                if (hedefiBuBotOlanIslemler.length === 0) {
                    await this.ode(this.config.tx_lower_limit, botParmakIzi);
                }
            }
            // wait 1 seconds for request finishing
            // await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            Istemci.errorLogla(error);
        }
    }

    async ode(miktar, hedef) {
        const transRequest = {
            source: this.parmakIzi, target: hedef, amount: miktar, timestamp: Istemci.isoTurkiye(),
        }
        const serilestirilmis = JSON.stringify(transRequest, ['source', 'target', 'amount', 'timestamp']);
        const hash = crypto.createHash('md5').update(serilestirilmis).digest("hex");
        console.log('Ödeme yapılıyor:' + JSON.stringify(transRequest));
        try {
            console.log((await axios.post(this.url('transaction'), transRequest, {
                headers: {Authorization: `Bearer ${this.jwtTokeniOlustur(hash)}`}
            })).data);
        } catch (error) {
            Istemci.errorLogla(error);
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
            nonce: 1000000000,
            timestamp: Istemci.isoTurkiye(),
        }
        await this.beraberNonceBul(blockRequest);

        console.log(`${this.kaziSureleriSn.length}. blok kazıldı. Harcanan zaman: ` + this.kaziSureleriSn[0] + "sn");
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


