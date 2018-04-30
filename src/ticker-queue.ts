import {Ticker} from "./kraken-types";
import * as logger from "winston";
import {withDb} from "./util";

class TickerData {
    unsaved: Ticker[];
    last?: Ticker;

    constructor() {
        this.unsaved = [];
        this.last = undefined;
    }

    public addTicker(ticker: Ticker) {
        this.last = ticker;
        this.unsaved.push(ticker);
    }
}

export class TickerQueue {
    private tickers = new Map<string, TickerData>();

    constructor(private dbUrl: string) {
    }

    public doesTickerNeedsUpdate(pair: string, maxAge: number) {
        let pairTickers = this.tickers.get(pair);

        if (pairTickers === undefined || pairTickers.last == undefined) {
            return true;
        }

        return (Date.now() - pairTickers.last.timestamp) > maxAge;
    }

    private ensureTickerDataExists(pair: string) {
        let existingTickerData = this.tickers.get(pair);

        if (existingTickerData === undefined) {
            let tickerData = new TickerData();
            this.tickers.set(pair, tickerData);
            return tickerData;
        } else {
            return existingTickerData;
        }
    }

    public addTicker(ticker: Ticker) {
        this.ensureTickerDataExists(ticker.pair).addTicker(ticker);
    }

    public hasTickersToBeSaved() {
        for (let tickerData of this.tickers.values()) {
            if (tickerData.unsaved.length > 0) {
                return true;
            }
        }

        return false;
    }

    public saveTickers(): Promise<any> {
        if (!this.hasTickersToBeSaved()) {
            return Promise.resolve(0);
        }

        return withDb(this.dbUrl, db => {
            const tickersCollection = db.collection("tickers");
            const topPromises = [];

            for (let pairTickers of this.tickers.values()) {
                const unsavedTickers: Ticker[] = [];

                const promises = pairTickers.unsaved.map(ticker =>
                    tickersCollection.insertOne(ticker).catch(function (err: any) {
                        logger.error("error inserting ticker: " + err);
                        unsavedTickers.push(ticker);
                    }));

                topPromises.push(Promise.all(promises).then(function () {
                    pairTickers.unsaved = unsavedTickers;
                }));
            }

            return Promise.all(topPromises);
        });
    }
}
