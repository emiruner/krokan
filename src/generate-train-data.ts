import {setupStandardLog} from "./util";
import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {OrderBook, TradeInfo} from "./kraken-types";

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

function categoryToOneHot(category: number) {
    if (category == 0) {
        return "1,0,0,0";
    } else if (category == 1) {
        return "0,1,0,0";
    } else if (category == 2) {
        return "0,0,1,0";
    } else if (category == 3) {
        return "0,0,0,1";
    } else {
        throw new Error("unexpected category: " + category);
    }
}

function generateData(trades: TradeInfo[], sampleWidth: number, bufferWidth: number, revenueRatio: number) {
    for (let i = 0; i < trades.length - bufferWidth; ++i) {
        const lastTrade = parseFloat(trades[i + sampleWidth].price);
        const sellThreshold = lastTrade - (revenueRatio * lastTrade);
        const buyThreshold = lastTrade + (revenueRatio * lastTrade);

        let sellThresholdPassed = false;
        let buyThresholdPassed = false;

        for (let j = i + sampleWidth + 1; (j < i + sampleWidth + 1 + bufferWidth) && j < (trades.length - 1); ++j) {
            const nextPrice = parseFloat(trades[j].price);

            if (nextPrice < sellThreshold) {
                sellThresholdPassed = true;
            } else if (nextPrice > buyThreshold) {
                buyThresholdPassed = true;
            }
        }

        let category = 0;

        if (sellThresholdPassed && buyThresholdPassed) {
            category = 3;
        } else if (sellThresholdPassed) {
            category = 1;
        } else if (buyThresholdPassed) {
            category = 2;
        }

        console.log(categoryToOneHot(category) + "," + trades.slice(i, i + sampleWidth).map(ti => (parseFloat(ti.price) - lastTrade).toFixed(6)).join(","));
    }
}

function main() {
    const tradeDb = new TradeDb(mongoUrl);

    const columnNames = ["expected"];

    for (let i = 0; i < 100; ++i) {
        columnNames.push("trade" + i);
    }

    // console.log(columnNames.join(","));

    return tradeDb.getTrades().then(allTrades => {
        // generateData(allTrades.slice(allTrades.length - 8192), 32, 512, 0.01);
        generateData(allTrades.slice(0, allTrades.length - 10), 32, 256, 0.01);
    });
}

main();

