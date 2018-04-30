import {TickerQueue} from "./ticker-queue";
import {Kraken} from "./kraken-wrapper";
import {Ticker} from "./kraken-types";
import {mongoUrl} from "./mongo-config";
import {setupStandardLog, withDb} from "./util";
import {createPublicKraken} from "./kraken-util";
import {ConfigEntry} from "./config-entry";

const logger = setupStandardLog("download-tickers.log");

function downloadTickers(dbUrl: string, pairs: Array<string>, kraken: Kraken) {
    const maxAge = 10000;
    const tickerQueue = new TickerQueue(dbUrl);

    function findTickersNeedingUpdate() {
        return pairs.filter(ticker => tickerQueue.doesTickerNeedsUpdate(ticker, maxAge));
    }

    function printTickerSummary(ticker: Ticker) {
        const lowToHighPercent = (parseFloat(ticker.high.today) - parseFloat(ticker.low.today)) * 100 / parseFloat(ticker.low.today);
        logger.info(`${ticker.pair} -> ask: ${ticker.ask.price}, bid: ${ticker.bid.price}, last: ${ticker.lastTradeClosed.price}, low today: ${ticker.low.today}, `
            + `24 hours: ${ticker.low.last24Hours}, high today: ${ticker.high.today}, 24 hours: ${ticker.high.last24Hours}, ltohi pct: ${lowToHighPercent.toFixed(6)}`)
    }

    function getTickers(loggedTickers: string[]): Promise<number> {
        const tickersToBeUpdated = findTickersNeedingUpdate();

        if (tickersToBeUpdated.length === 0) {
            return Promise.resolve(0);
        } else {
            return kraken.getTickers(tickersToBeUpdated).then(tickers => {
                logger.info(tickers.length + " tickers returned.");

                tickers.forEach(ticker => tickerQueue.addTicker(ticker));
                tickers.filter(ticker => loggedTickers.indexOf(ticker.pair) != -1).forEach(printTickerSummary);

                return tickers.length;
            });
        }
    }

    function download(loggedTickers: string[]) {
        getTickers(loggedTickers).then(() => {
            setTimeout(() => download(loggedTickers), maxAge / 2);
        }).catch(err => {
            logger.error("getTickers error: " + err);
            setTimeout(() => download(loggedTickers), 1000);
        });
    }

    function store() {
        tickerQueue.saveTickers().then(() => {
            setTimeout(store, maxAge / 2);
        }).catch(err => {
            logger.error("storeTickers error: " + err);
            setTimeout(store, 1000);
        });
    }

    function getLoggedTickers() {
        return withDb(mongoUrl, db =>
            db.collection("config").find({key: "downloadTickersLoggedPairs"}).toArray().then((result: ConfigEntry<string[]>[]) => {
                if (result.length == 0) {
                    return [] as string[]
                } else {
                    return result[0].value
                }
            })
        );
    }

    getLoggedTickers().then(loggedTickers => {
        download(loggedTickers);
        store();
    })
}

const kraken = createPublicKraken();

kraken
    .getAssetPairs()
    .then((assetPairs: any) => Object.keys(assetPairs).filter(pairName => !pairName.endsWith(".d")))
    .then((pairNames: string[]) => {
        downloadTickers(mongoUrl, pairNames, kraken);
    });
