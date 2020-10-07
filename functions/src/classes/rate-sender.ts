import {Util} from "./util";
import url from "url";
import https from "https";
import admin from 'firebase-admin';
import App = admin.app.App;

export class RateSender {

    private _loaded: boolean = false;
    private _rate: { [index: string]: object } = {};
    private _app: App|null = null;

    private async readJson(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const config = Util.config();
            const option = url.parse(config['rate-url']);
            const request = https.get(option, (response) => {
                response.setEncoding('utf8');
                let responseBody = '';
                response.on('data', (chunk) => {
                    responseBody += chunk;
                });
                response.on('end', () => {
                    resolve(responseBody);
                });
                response.on('error', (e) => {
                    reject(e);
                });
            });
            request.end();
        });
    }

    private async load(): Promise<void> {
        const json: string = await this.readJson();
        const decoded = JSON.parse(json);
        const quotes: any[] = decoded['quotes'];
        for (const val of quotes) {
            this._rate[val['currencyPairCode']] = val;
        }
        this._loaded = true;
    }

    public async rate(pairCode: string): Promise<any> {
        if (!this._loaded) {
            await this.load();
        }
        return this._rate.hasOwnProperty(pairCode) ? this._rate[pairCode] : {};
    }

    public async send(pairCode: string): Promise<string> {
        const config = Util.config();
        if (this._app == null) {
            this._app = admin.initializeApp({
                credential: admin.credential.cert(require(`${Util.baseDir()}/config/sdk.json`)),
                databaseURL: config['fb-databaseURL']
            });
        }

        const rate: any = await this.rate(pairCode);
        const message = {
            notification: {
                title: `${pairCode.substr(0, 3)} -> ${pairCode.substr(3)}`,
                body: `bid:${rate['bid']} ask:${rate['ask']}`
            },
            data: {
                url: '/rates',
                click_action: "FLUTTER_NOTIFICATION_CLICK"
            },
            topic: `${pairCode}`
        };

        return new Promise<string>(((resolve, reject) => {
            admin.messaging().send(message).then((response) => {
                resolve(response);
            }).catch((error) => {
                reject(error);
            });
        }));
    }
}
