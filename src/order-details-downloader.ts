import {Kraken} from "./kraken-wrapper";
import {TradeDb} from "./trade-db";
import * as logger from "winston";
import {Order} from "./kraken-types";

export class OrderDetailsDownloader {
    constructor(private tradeDb: TradeDb, private kraken: Kraken) {
    }

    schedule = () => {
        this.checkActiveOrders()
            .catch(error => logger.info("error occured while checking active orders" + error))
            .then(() => setTimeout(this.schedule, 10000));
    };

    private checkActiveOrders() {
        logger.info("checking active orders");

        return this.tradeDb
            .getActiveOrdersTransactionIds()
            .then(activeOrderTransactionIds => this
                .downloadDetails(activeOrderTransactionIds, 0)
                .then(orders => this.tradeDb.updateOrderDetails(orders))
            );
    }

    downloadDetails(transactionIds: string[], currentOffset: number): Promise<Order[]> {
        if (currentOffset == 0) {
            logger.info(`there are ${transactionIds.length} possibly active orders to check.`);
        }

        const sentOrdersIdsBatch: string[] = [];

        let nextOffset = currentOffset;

        while (sentOrdersIdsBatch.length < 20 && nextOffset < transactionIds.length) {
            sentOrdersIdsBatch.push(transactionIds[nextOffset]);
            ++nextOffset;
        }

        if (sentOrdersIdsBatch.length > 0) {
            return this.kraken
                .queryOrders(sentOrdersIdsBatch)
                .catch(error => {
                    logger.error(`error occured while querying orders: ${error}`);
                    return [] as Order[];
                })
                .then(orders => this
                    .downloadDetails(transactionIds, nextOffset)
                    .then(nextClosedOrders => orders.concat(nextClosedOrders))
                );
        } else {
            return Promise.resolve([] as Order[]);
        }
    }
}