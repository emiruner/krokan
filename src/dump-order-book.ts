import {createPublicKraken} from "./kraken-util";
import {OrderBookEntry} from "./kraken-types";

function sortByTimestamp(ob1: OrderBookEntry, ob2: OrderBookEntry) {
    return ob1.timestamp - ob2.timestamp;
}

function makeDumper(prefix: string) {
    return function dumpOrderBookEntry(ob: OrderBookEntry) {
        console.log(`${prefix} at ${parseFloat(ob.price).toFixed(6)} vol: ${ob.volume} timestamp: ${new Date(ob.timestamp)}`)
    }
}

if (process.argv.length < 3) {
    console.log("please give pair and count as arg")
} else {
    const kraken = createPublicKraken();

    kraken
        .orderBook(process.argv[2], process.argv.length > 3 ? parseInt(process.argv[3]) : 100)
        .then(ob => {
            ob.asks.sort(sortByTimestamp).forEach(makeDumper("sell"));
            ob.bids.sort(sortByTimestamp).reverse().forEach(makeDumper("buy"));

            // ob.asks.reverse().forEach(ask => console.log(`sell at ${parseFloat(ask.price).toFixed(6)} vol: ${ask.volume} timestamp: ${new Date(ask.timestamp)}`));
            // ob.bids.forEach(bid => console.log(`buy  at ${parseFloat(bid.price).toFixed(6)} vol: ${bid.volume} timestamp: ${new Date(bid.timestamp)}`));
        });

    kraken.stop();
}
