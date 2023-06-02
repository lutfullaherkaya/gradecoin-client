const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require("crypto");

const PARMAK_IZI = '60873eeb2d28388eeba204878977d0a73598745fc9357f196c579660924075d6';

class Istemci {
    constructor(ozelAnahtar, parmakIzi, config) {
        this.ozelAnahtar = ozelAnahtar;
        this.parmakIzi = parmakIzi;
        this.config = config;
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

    jwtTokeniOlustur(hash = "000000ecdc24b40a82cf2deab684d4f68296f3e69d123e361afe7514a84bab82") {
        const unixTime = Math.floor(Date.now() / 1000);
        const unixTimePlus2h = unixTime + 7200;

        const jwtData = {
            tha: hash, iat: unixTime, exp: unixTimePlus2h
        }

        const token = jwt.sign(jwtData, this.ozelAnahtar, {algorithm: 'RS256', allowInsecureKeySizes: true});
        console.log('Token oluşturuldu:');
        console.log(token);
        return token;
    }

    async botaAsgariOde() {
        const botParmakIzi = '5dcdedc9a04ea6950153c9279d0f8c1ac9528ee8cdf5cd912bebcf7764b3f9db';
        await this.ode(this.config.tx_lower_limit, botParmakIzi);
    }

    async ode(miktar, hedef) {
        const transRequest = {
            source: this.parmakIzi, target: hedef, amount: miktar, timestamp: Istemci.isoTurkiye(),
        }
        const serilestirilmis = JSON.stringify(transRequest, ['source', 'target', 'amount', 'timestamp']);
        const hash = crypto.createHash('md5').update(serilestirilmis).digest("hex");
        console.log('Ödeme yapılıyor:')
        console.log(transRequest);
        try {
            console.log((await axios.post(this.url('transaction'), transRequest, {
                headers: {Authorization: `Bearer ${this.jwtTokeniOlustur(hash)}`}
            })).data);
        } catch (error) {
            console.error(error);
        }


    }

    async ilkOnIslem() {
        console.log('İlk on işlem alınıyor.');
        await this.botaAsgariOde();
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
                if (islemler.length >= 10) {
                    // sort islemler by iso timestamp
                    islemler.sort((a, b) => {
                        const aDate = new Date(a.timestamp);
                        const bDate = new Date(b.timestamp);
                        return aDate - bDate;
                    });
                    const kendiIslemimIndeks = islemler.findIndex(islem => islem.source === this.parmakIzi);
                    if (kendiIslemimIndeks === -1) {
                        console.log('Kendi işlemim bulunamadı. Tekrar bota ödeme yapılıyor.');
                        await this.botaAsgariOde();
                        continue;
                    }
                    // put kendiIslemimIndeks to the start of the array
                    islemler.unshift(islemler.splice(kendiIslemimIndeks, 1)[0]);

                    break;
                } else {
                    console.log('İşlem sayısı 10 değil ' + islemler.length + '.')
                }
            } catch (error) {
                console.error(error);
            }
            console.log('10sn sonra tekrar denenecek.');
            await new Promise(resolve => setTimeout(resolve, 10000));


        }
        console.log('İlk on işlem alındı.');
        return islemler.slice(0, 10);


    }


}

async function main() {
    const ozelAnahtar = fs.readFileSync('2048-bit-rsa-private.txt', "utf8");
    const config = (await axios.get('https://gradecoin.xyz/config')).data;
    const istemci = new Istemci(ozelAnahtar, PARMAK_IZI, config);
    istemci.jwtTokeniOlustur()
    let islemler = []
    islemler = await istemci.ilkOnIslem();
    console.log(islemler);
    console.log(islemler.length);

    const blockRequest = {
        transaction_list: islemler.map(islem => islem.id), nonce: 0, timestamp: Istemci.isoTurkiye(), hash: '',
    }

    console.log(blockRequest)


    /*axios.post('https://gradecoin.xyz/block', blockRequest, {
        headers: {Authorization: `Bearer ${istemci.jwtTokeniOlustur()}`}
    }).then(function (response) {
        console.log(response);
    }).catch(function (error) {
        console.log(error);
    })*/


}


main();

