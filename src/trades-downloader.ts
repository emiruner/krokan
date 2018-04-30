import {setupStandardLog} from "./util";
import {Kraken} from "./kraken-wrapper";
import {TradeDb} from "./trade-db";
import {BuyOrSell, MarketLimit, TradeInfo} from "./kraken-types";
import {mongoUrl} from "./mongo-config";
import {createPublicKraken} from "./kraken-util";

const logger = setupStandardLog("trades-downloader.log");

class TradesDownloader {
    constructor(private pair: string, private kraken: Kraken, private tradeDb: TradeDb) {
    }

    downloadTrades() {
        return this.tradeDb.getTradeLast().then(tradeLast =>
            this.kraken.tradesRaw(this.pair, tradeLast).then(result => {
                const trades = result[this.pair].map((rawTrade: any) => {
                    const trade = new TradeInfo();

                    trade.pair = this.pair;
                    trade.price = rawTrade[0];
                    trade.volume = rawTrade[1];
                    trade.time = rawTrade[2] * 1000;
                    trade.buySell = rawTrade[3] == "s" ? BuyOrSell.Sell : BuyOrSell.Buy;
                    trade.marketLimit = rawTrade[4] == "m" ? MarketLimit.Market : MarketLimit.Limit;

                    return trade;
                });

                logger.info(`got ${trades.length} trades`);

                if(trades.length > 0) {
                    return this.tradeDb.saveTrades(trades).then(() => {
                        return this.tradeDb.storeTradeLast(result.last);
                    }).then(() => Promise.resolve());
                } else {
                    return Promise.resolve();
                }
            }))
    }

    schedule = () => {
        this.downloadTrades().catch(error => {
            logger.error("an error occured: " + error);
        }).then(() => setTimeout(this.schedule, 60000));
    }
}

if (process.argv.length != 3) {
    console.log("please give pair as arg")
} else {
    const kraken = createPublicKraken();
    const tradeDb = new TradeDb(mongoUrl);

    new TradesDownloader(process.argv[2], kraken, tradeDb).schedule();
}