import {Kraken} from "./kraken-wrapper";
import * as logger from "winston";
import {TradeDb} from "./trade-db";
import {StoredUnsentOrder} from "./trade-db-types";
import {NonceSource} from "./kraken-client";
import {generalErrorHandler} from "./util";

function isKrakenError(error: Error) {
    return error.message.startsWith("Kraken API returned error");
}

export class OrderSender {
    waitTime: number;

    constructor(private tradeDb: TradeDb, private kraken: Kraken, private nonceSource: NonceSource) {
        this.waitTime = 10000;
    }

    enqueue(order: any) {
        logger.info("enqueueing order: " + JSON.stringify(order));

        return this.nonceSource.newNonce().then(nonce => {
            order.userref = nonce.toString();
            this.tradeDb.addUnsentOrder(nonce.toString(), order).catch(generalErrorHandler(logger));
            return nonce.toString();
        })
    }

    private sendUnsentOrder(unsentOrder: StoredUnsentOrder) {
        logger.info("sending order: " + JSON.stringify(unsentOrder.order));

        return this.kraken
            .addOrder(unsentOrder.order, parseInt(unsentOrder.userRef))
            .then(result => {
                if (result.transactionIds.length > 1) {
                    logger.error("one transaction id expected but more come: " + result.transactionIds.length);
                }

                return Promise.all([
                    this.tradeDb.addSentOrder(unsentOrder.userRef, result.transactionIds[0]),
                    this.tradeDb.removeUnsentOrder(unsentOrder._id)
                ]);
            })
            .catch(error => {
                if (isKrakenError(error)) {
                    if (error.message.indexOf("Invalid nonce") == -1) {
                        logger.error("Kraken API returned error, will NOT retry later: " + error.message);

                        return Promise.all([
                            this.tradeDb.addFailedOrder(new Date(), unsentOrder.order, error.toString()).catch(generalErrorHandler(logger)),
                            this.tradeDb.removeUnsentOrder(unsentOrder._id).catch(generalErrorHandler(logger))
                        ]) as Promise<any>
                    } else {
                        logger.error("Kraken indicates this nonce is used so we assume order is sent successfully.");

                        return Promise.all([
                            this.tradeDb.addWaitingForIdOrder(unsentOrder.userRef).catch(generalErrorHandler(logger)),
                            this.tradeDb.removeUnsentOrder(unsentOrder._id).catch(generalErrorHandler(logger))]
                        ) as Promise<any>
                    }
                } else {
                    logger.error("error occured while re-sending order, will retry later: " + error);
                    return Promise.resolve() as Promise<any>
                }
            })
    }

    private sendUnsentOrders(unsentOrders: StoredUnsentOrder[]): Promise<any> {
        if (unsentOrders.length == 0) {
            return Promise.resolve();
        }

        return this.sendUnsentOrder(unsentOrders[0]) as Promise<any>;
    }

    scheduleAutoResend = () => {
        this.tradeDb.getUnsentOrders()
            .then(unsentOrders => this.sendUnsentOrders(unsentOrders))
            .catch(error => logger.error(`error occured while resending: ${error}`))
            .then(() => setTimeout(this.scheduleAutoResend, this.waitTime));
    };

    /**
     * If an order is sent, then return it otherwise return undefined.
     */
    findSentOrder(sendKey: string) {
        return this.tradeDb.findSentOrderByUserRef(sendKey);
    }

    getOrderFailureInfo(sendKey: string) {
        return this.tradeDb.getOrderFailureInfo(sendKey);
    }
}
