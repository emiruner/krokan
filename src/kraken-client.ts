import * as logger from "winston";

const request = require('request');
const crypto = require('crypto');
const querystring = require('querystring');

const timeoutMS = 10000;
const apiUrl = 'https://api.kraken.com';
const apiVersion = '0';
const apiPointLimit = 10;

const publicMethods = ['Time', 'Assets', 'AssetPairs', 'Ticker', 'Depth', 'Trades', 'Spread', 'OHLC'];
const privateMethods: { [key: string]: number; } = {
    'Balance': 1, 'TradeBalance': 1, 'OpenOrders': 1, 'ClosedOrders': 1, 'QueryOrders': 1,
    'TradesHistory': 2, 'QueryTrades': 1, 'OpenPositions': 1, 'Ledgers': 2, 'QueryLedgers': 2,
    'TradeVolume': 1, 'AddOrder': 1, 'CancelOrder': 1, 'DepositMethods': 1, 'DepositAddresses': 1,
    'DepositStatus': 1, 'WithdrawInfo': 1, 'Withdraw': 1, 'WithdrawStatus': 1, 'WithdrawCancel': 1
};

export interface NonceSource {
    newNonce(): Promise<number>;
}

class KrakenRequest {
    method: string;
    params: any;
    promise: Promise<any>;
    resolve: (value?: (PromiseLike<any> | any)) => void;
    reject: (reason?: any) => void;
    nonce: number | undefined;

    constructor(method: string, params: any) {
        this.method = method;
        this.params = params;
    }
}

export class KrakenClient {
    private lastPrivateRequestTime = Date.now();
    private apiPoints = 0;
    private requestQueue: KrakenRequest[] = [];
    private stopRequested = false;

    constructor(private key: string, private secret: string, private nonceSource: NonceSource) {
        this.sendMessage();
    }

    api(method: string, params: any, nonce?: number): Promise<any> {
        if (publicMethods.indexOf(method) !== -1) {
            return this.publicMethod(method, params);
        } else if (privateMethods[method]) {
            return this.privateMethod(method, params, nonce);
        } else {
            throw new Error(method + ' is not a valid API method.');
        }
    }

    publicMethod(method: string, params: any) {
        params = params || {};

        const path = '/' + apiVersion + '/public/' + method;
        const url = apiUrl + path;

        return this.rawRequest(url, {}, params);
    }

    privateMethod(method: string, params: any, nonce?: number) {
        const krakenRequest = new KrakenRequest(method, params);

        krakenRequest.promise = new Promise((resolve, reject) => {
            krakenRequest.resolve = resolve;
            krakenRequest.reject = reject;
        });

        krakenRequest.nonce = nonce;

        this.requestQueue.push(krakenRequest);

        return krakenRequest.promise;
    }

    sendMessage() {
        if(this.stopRequested) {
            return;
        }

        this.updateApiPoints();

        if (this.requestQueue.length == 0) {
            setTimeout(() => this.sendMessage(), 500);
        } else {
            const nextRequest = this.requestQueue[0];

            if (this.apiPoints + privateMethods[nextRequest.method] >= apiPointLimit) {
                setTimeout(() => this.sendMessage(), 500);
            } else {
                this.requestQueue.shift();

                this.privateSend(nextRequest.method, nextRequest.params, nextRequest.nonce)
                    .then(result => {
                        setTimeout(() => this.sendMessage(), 500);
                        nextRequest.resolve(result);
                    })
                    .catch(error => {
                        setTimeout(() => this.sendMessage(), 500);
                        nextRequest.reject(error);
                    })
            }
        }
    }

    privateSend(method: string, params: any, nonce?: number) {
        params = params || {};

        const path = '/' + apiVersion + '/private/' + method;
        const url = apiUrl + path;

        return (nonce ? Promise.resolve(nonce as number) : this.nonceSource.newNonce()).then(nonce => {
            params.nonce = nonce;

            const signature = this.getMessageSignature(path, params, params.nonce);

            console.log("nonce = " + nonce + ", signature: " + signature + " api key : " + this.key);

            const headers = {
                'API-Key': this.key,
                'API-Sign': signature
            };

            this.apiPoints += privateMethods[method];
            return this.rawRequest(url, headers, params);
        })
    }

    getMessageSignature(path: string, request: any, nonce: number) {
        const message = querystring.stringify(request);
        const secret = new Buffer(this.secret, 'base64');
        const hash = new crypto.createHash('sha256');
        const hmac = new crypto.createHmac('sha512', secret);

        const hashDigest = hash.update(nonce + message).digest('binary');
        const hmacDigest = hmac.update(path + hashDigest, 'binary').digest('base64');

        return hmacDigest;
    }

    rawRequest(url: string, headers: any, params: any): Promise<any> {
        // Set custom User-Agent string
        headers['User-Agent'] = 'Kraken Javascript API Client';

        const options = {
            url: url,
            method: 'POST',
            headers: headers,
            form: params,
            timeout: timeoutMS
        };

        return new Promise((resolve, reject) => {
            logger.info(`sending request, url: ${url}${params.nonce ? ', nonce: ' + params.nonce : ''}`);

            request.post(options, function (error: any, response: any, body: any) {
                if (error) {
                    reject(new Error('Error in server response: ' + JSON.stringify(error)));
                } else {
                    try {
                        const data = JSON.parse(body);

                        //If any errors occured, Kraken will give back an array with error strings under
                        //the key "error". We should then propagate back the error message as a proper error.
                        if (data.error && data.error.length) {
                            let krakenError = '<unknown error>';

                            data.error.forEach(function (element: string) {
                                if (element.charAt(0) === "E") {
                                    krakenError = element.substr(1);
                                    return false;
                                }
                            });

                            reject(new Error('Kraken API returned error: ' + krakenError));
                        } else {
                            resolve(data.result);
                        }
                    } catch (e) {
                        reject(new Error('Could not understand response from server: ' + body));
                    }
                }
            })
        });
    }

    private updateApiPoints() {
        const dropPoints = (Date.now() - this.lastPrivateRequestTime) / 1000 / 3;

        this.apiPoints -= dropPoints;

        if (this.apiPoints < 0) {
            this.apiPoints = 0;
        }

        this.lastPrivateRequestTime = Date.now()
    }

    public stop() {
        this.stopRequested = true;
    }
}
