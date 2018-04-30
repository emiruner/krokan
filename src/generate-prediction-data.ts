import {setupStandardLog} from "./util";
import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {OrderBook} from "./kraken-types";

setupStandardLog("trade.log");

function compareByTimestamp(o1: { timestamp: number }, o2: { timestamp: number }) {
    return o1.timestamp - o2.timestamp;
}

function processNext(tradeDb: TradeDb, orderBooks: OrderBook[], current: number): Promise<void> {
    if (current >= orderBooks.length) {
        return Promise.resolve();
    }

    const orderBook = orderBooks[current];

    return tradeDb.findClosestBuySellPrice(orderBook.timestamp + (5 * 60 * 1000))
        .then(closestBuySell => {
            const asksAndBids = orderBook.asks.slice(0, 50).concat(orderBook.bids.slice(0, 50).map(bid => {
                bid.price = "-" + bid.price;
                return bid;
            }));
            const prices = asksAndBids.sort(compareByTimestamp).map(askOrBid => askOrBid.price);

            console.log(closestBuySell[0] + "," + prices.join(","));
        })
        .catch(error => console.error("an error occured: " + error))
        .then(() => processNext(tradeDb, orderBooks, current + 1))
}

function main() {
    const tradeDb = new TradeDb(mongoUrl);

    const columnNames = ["buy"];

    for (let i = 0; i < 100; ++i) {
        columnNames.push("trade" + i);
    }

    console.log(columnNames.join(","));

    return tradeDb.getLatestOrderBook().then(orderBook => {
        const asksAndBids = orderBook.asks.slice(0, 50).concat(orderBook.bids.slice(0, 50).map(bid => {
            bid.price = "-" + bid.price;
            return bid;
        }));
        const prices = asksAndBids.sort(compareByTimestamp).map(askOrBid => askOrBid.price);

        console.log((["0"].concat(prices)).join(","));
    })
}

main();

