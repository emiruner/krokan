import {mongoUrl} from "./mongo-config";
import {withDb} from "./util";
import {TradeDb} from "./trade-db";
import {withKraken} from "./kraken-util";

function main() {
    withKraken(mongoUrl, "general", kraken => withDb(mongoUrl, db => {
        return new TradeDb(mongoUrl).getSentOrders().then(sentOrders => {
                const promises: Promise<any>[] = [];

                sentOrders.forEach(sentOrder => {
                    console.log("canceling order: " + sentOrder.transactionId);
                    return promises.push(kraken.cancelOrder(sentOrder.transactionId).catch(error => console.log("error cancelling order: " + error)));
                });

                return Promise.all(promises);
            }
        );
    }));
}

