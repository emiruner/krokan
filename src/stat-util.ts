import {Ticker} from "./kraken-types";
import {Db} from "mongodb";

export function bidAskSimpleMovingAverage(db: Db, pair: string, count: number): Promise<{ askSma: number; bidSma: number }> {
    return db
        .collection("tickers")
        .find({pair: pair})
        .sort({timestamp: -1})
        .limit(count)
        .toArray()
        .then((tickers: Ticker[]) => {
            if (tickers.length < count) {
                throw new Error(`do not have enough ticker info, got ${tickers.length}, needed ${count}`);
            } else {
                let askSum = 0;
                let bidSum = 0;

                for (let ticker of tickers) {
                    askSum += parseFloat(ticker.ask.price);
                    bidSum += parseFloat(ticker.bid.price);
                }

                return {askSma: askSum / tickers.length, bidSma: bidSum / tickers.length};
            }
        })
}

