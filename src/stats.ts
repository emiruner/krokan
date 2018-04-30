import {localTimestampString, setupStandardLog, withDb} from "./util";
import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {Order, OrderBook, SellOrder} from "./kraken-types";
import {withKraken} from "./kraken-util";

setupStandardLog("trade.log");

function main() {
    withDb(mongoUrl, db => {
        const tradeDb = new TradeDb(mongoUrl);

        return tradeDb.getTrades().then(trades => {
            let current = parseFloat(trades[0].price) * 1000;

            trades.forEach(trade => {
                const next = parseFloat(trade.price) * 1000;

                if(next != current) {
                    console.log(current.toFixed(6));
                    current = next;
                }
            });
        });
    })
}

main();

