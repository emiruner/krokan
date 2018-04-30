import {localTimestampString, setupStandardLog} from "./util";
import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {BuyOrder, Order, SellOrder} from "./kraken-types";
import {WaitingOrderClosingPosition} from "./position";

setupStandardLog("trade.log");

function main(onlyWaiting: boolean) {
    const tradeDb = new TradeDb(mongoUrl);

    let allFee = 0;
    let allPair1 = 0;
    let allPair2 = 0;

    return tradeDb.getPositons().then(positions =>
        Promise.all(positions
            .filter(position => position.completedTransactions.length > 0)
            .map(position => tradeDb.querySentOrdersByTransactionIds(position.completedTransactions).then(transactions => {
                let totalFee = 0;
                let totalPair1 = 0;
                let totalPair2 = 0;

                const displayPosition = !onlyWaiting || position instanceof WaitingOrderClosingPosition;

                if (displayPosition) {
                    console.log("");
                }

                transactions.forEach(txn => {
                    const order = txn.details as Order;
                    const fee = parseFloat(order.fee);

                    totalFee += fee;

                    const volume = parseFloat(order.volume);
                    const cost = parseFloat(order.cost);

                    if (order instanceof SellOrder) {
                        totalPair1 -= volume;
                        totalPair2 += cost;
                    } else if (order instanceof BuyOrder) {
                        totalPair1 += volume;
                        totalPair2 -= cost;
                    } else {
                        console.error(`unexpected type of order ${order}`);
                    }

                    if (displayPosition) {
                        console.log("    " + order.txId + " -> closed at: " + localTimestampString(new Date(order.closeTime * 1000)) +
                            ", fee: " + fee.toFixed(6) + ", price: " + (cost / volume).toFixed(6) + ", descr: " + order.orderDescription);
                    }
                });

                allFee += totalFee;
                allPair1 += totalPair1;
                allPair2 += totalPair2;

                if (displayPosition) {
                    let positionStr = position.constructor.name + " " + position._id;

                    if (position instanceof WaitingOrderClosingPosition) {
                        positionStr += " " + position.currentTxnId;
                    }

                    console.log(positionStr, "at:", position.startingPrice, ", volume:", position.volume,
                        ", completed count:", position.completedTransactions.length, ", total fee:", totalFee.toFixed(6),
                        ", totals", totalPair1.toFixed(6), "/", totalPair2.toFixed(6))
                }
            }))
        ).then(() => console.log("\nall fee: " + allFee.toFixed(6) + ", all pair 1: " + allPair1 + ", all pair 2: " + allPair2.toFixed(6)))
    )
}

main(process.argv.indexOf("onlyWaiting") != -1);

