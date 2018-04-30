import {Kraken} from "./kraken-wrapper";
import {TradeDb} from "./trade-db";
import * as logger from "winston";
import {Order} from "./kraken-types";
import {WaitingForIdOrder} from "./trade-db-types";

/**
 * Determines transaction id of Orders with undetermined transaction id's.
 */
export class OrderIdChecker {
    constructor(private tradeDb: TradeDb, private kraken: Kraken) {
    }

    schedule = () => {
        this.waitingForIdOrders()
            .catch(error => logger.info("error occured while checking active orders: " + error))
            .then(() => setTimeout(this.schedule, 10000));
    };

    private waitingForIdOrders() {
        logger.info("trying to determine id's of waiting for id orders");

        return this.tradeDb
            .getWaitingForIdOrders()
            .then(waitingForIdOrders => this.determineIds(waitingForIdOrders, 0));
    }

    determineIds(waitingForIdOrders: WaitingForIdOrder[], currentOffset: number): Promise<any> {
        if (currentOffset == 0) {
            logger.info(`there are ${waitingForIdOrders.length} orders for id's to be checked.`);
        }

        if (currentOffset == waitingForIdOrders.length) {
            return Promise.resolve()
        }

        const waitingForIdOrder = waitingForIdOrders[currentOffset];

        return this.kraken.getOpenOrders(waitingForIdOrder.userRef).then(openOrders => {
            const foundOrdersPromise =
                openOrders.length > 0
                    ? Promise.resolve(openOrders)
                    : this.kraken.getClosedOrders({userref: waitingForIdOrder.userRef});

            return foundOrdersPromise.then(foundOrders => {
                if (foundOrders.length > 0) {
                    return Promise.all([
                        this.tradeDb.addSentOrder(waitingForIdOrder.userRef, foundOrders[0].txId),
                        this.tradeDb.removeWaitingForIdOrder(waitingForIdOrder._id)
                    ]) as Promise<any>;
                } else {
                    return Promise.resolve(0);
                }
            });
        }).then(() => this.determineIds(waitingForIdOrders, currentOffset + 1));
    }
}