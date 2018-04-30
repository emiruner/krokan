import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {setupStandardLog} from "./util";
import {WaitingOrderClosingPosition} from "./position";
import {withKraken} from "./kraken-util";

setupStandardLog("trade.log");

function main() {
    withKraken(mongoUrl, "general", kraken => {
        const tradeDb = new TradeDb(mongoUrl);

        return tradeDb.getPositonsByType(WaitingOrderClosingPosition).then(positions =>
            Promise.all(positions
                .filter(position => position.completedTransactions.length > 0)
                .filter(position => position.completedTransactions.length % 2 == 0)
                .map(position => position.currentTxnId)
                .map(txnId => {
                    console.log("canceling order: " + txnId);
                    return kraken.cancelOrder(txnId).catch(error => console.log("error cancelling order: " + error)) as Promise<any>
                }))
        )
    })
}

main();

