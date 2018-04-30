import {setupStandardLog} from "./util";
import {Kraken} from "./kraken-wrapper";
import {TradeDb} from "./trade-db";
import {mongoUrl} from "./mongo-config";
import {createPublicKraken} from "./kraken-util";

const logger = setupStandardLog("download-order-book.log");

class OrderBookDownloader {
    constructor(private pair: string, private count: number, private kraken: Kraken, private tradeDb: TradeDb) {
    }

    downloadOrderBook() {
        return this.kraken.orderBook(this.pair, this.count).then(ob => this.tradeDb.saveOrderBook(ob))
    }

    schedule = () => {
        this.downloadOrderBook()
            .catch(error => logger.error("an error occured: " + error))
            .then(() => setTimeout(this.schedule, 60000));
    }
}

if (process.argv.length < 3) {
    console.log("please give pair as arg")
} else {
    const kraken = createPublicKraken();
    const tradeDb = new TradeDb(mongoUrl);

    new OrderBookDownloader(process.argv[2], process.argv.length > 3 ? parseInt(process.argv[3]) : 100, kraken, tradeDb).schedule();
}
