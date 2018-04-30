import {OrderSender} from "./order-sender";
import * as logger from "winston";
import {setTimeout} from "timers";
import {TradeDb} from "./trade-db";
import {SentOrder} from "./trade-db-types";
import {BuyOrder, BuyOrSell, Order, OrderStatus, SellOrder} from "./kraken-types";
import {withDb} from "./util";
import {bidAskSimpleMovingAverage} from "./stat-util";
import {mongoUrl} from "./mongo-config";
import {
    ResponseStrategy, UnstartedPosition, WaitingOrderClosingPosition,
    WaitingOrderSendingPosition
} from "./position";

export class AutoTrader {
    constructor(private tradeDb: TradeDb, private orderSender: OrderSender, private pair: string) {
    }

    private sendNewOrderForPositionClosedOrder(position: WaitingOrderClosingPosition, closedTransaction: Order) {
        if (position.completedTransactions.length % 2 == 1 && !position.responseStrategy.repeat) {
            logger.info("matching order closed for position, stopping");
            return this.tradeDb.updatePosition(position.gotoStoppedAfterMatchingOrderClosed());
        } else {
            const newOrder = position.createMatchingOrder(closedTransaction);

            logger.info(`old price: ${closedTransaction.averagePrice}, lot: ${closedTransaction.volume}, fee: ${closedTransaction.fee}, new price: ${newOrder.price}`);

            return this.orderSender.enqueue(newOrder).then(sendKey => this.tradeDb.updatePosition(position.gotoWaitingSendAfterClose(sendKey, closedTransaction)))
        }
    }

    checkPositonsScheduler = () => {
        logger.debug("checking positions");

        return this
            .processUnstartedPositions()
            .then(() => this.processWaitingSendPositions())
            .then(() => this.processWaitingClosePositions())
            .then(() => this.trackHotZone())
            .catch(error => logger.error("an error occured while processing positons: " + error))
            .then(() => setTimeout(this.checkPositonsScheduler, 10000));
    };

    processUnstartedPositions() {
        logger.debug("checking unstarted positions");

        return this.tradeDb.getPositonsByType(UnstartedPosition, this.pair).then(positions =>
            Promise.all(positions.map(unstarted => {
                const sendPromise = this.orderSender.enqueue(unstarted.createOrder());

                sendPromise.then(sendKey =>
                    this.tradeDb.updatePosition(unstarted.gotoWaitingSend(sendKey))
                ).catch(error => {
                    logger.error("an error occured while sending order: " + error)
                });

                return sendPromise;
            })));
    }

    processWaitingSendPositions() {
        logger.debug("checking enqueue waiting positions");

        return this.tradeDb.getPositonsByType(WaitingOrderSendingPosition, this.pair).then(positions => {
            const promises: Promise<any>[] = [];

            for (let waitingSend of positions) {
                const items = this.orderSender.findSentOrder(waitingSend.sendOrderKey).then((sentOrder: SentOrder | undefined) => {
                    if (sentOrder) {
                        return this.tradeDb.updatePosition(waitingSend.gotoWaitingClose(sentOrder.transactionId)).then(() => Promise.resolve())
                    } else {
                        return this.orderSender.getOrderFailureInfo(waitingSend.sendOrderKey).then(info => {
                            if (info) {
                                logger.info(`order failure for key ${waitingSend.sendOrderKey}: ${info}`);
                                return this.tradeDb.updatePosition(waitingSend.gotoFailed(info)).then(() => Promise.resolve());
                            } else {
                                logger.debug(`order failure not found for key: ${waitingSend.sendOrderKey}`);
                                return Promise.resolve();
                            }
                        });
                    }
                });

                promises.push(items)
            }

            return Promise.all(promises);
        });
    }

    processWaitingClosePositions() {
        logger.debug("checking close waiting positions");

        return this.tradeDb.getPositonsByType(WaitingOrderClosingPosition, this.pair).then(positions => {
                logger.info(`there are ${positions.length} positions to check for ${this.pair}`);

                return this.tradeDb
                    .querySentOrdersByTransactionIds(positions.map(position => position.currentTxnId))
                    .then(sentOrders => {
                            return Promise.all(sentOrders.map(sentOrder => {
                                const found = positions.find(position => position.currentTxnId === sentOrder.transactionId);

                                if (found) {
                                    if (sentOrder.details !== undefined) {
                                        if (sentOrder.details.status === OrderStatus.Closed) {
                                            return this.sendNewOrderForPositionClosedOrder(found, sentOrder.details);
                                        } else if (sentOrder.details.status === OrderStatus.Canceled) {
                                            logger.info("the waited transaction cancelled: " + sentOrder.transactionId);
                                            return this.tradeDb.updatePosition(found.gotoStoppedAfterMatchingOrderCancelled());
                                        } else {
                                            return Promise.resolve();
                                        }
                                    } else {
                                        return Promise.resolve();
                                    }
                                } else {
                                    return Promise.resolve();
                                }
                            }) as Promise<any>[]);
                        }
                    )
            }
        );
    }

    trackHotZone() {
        return withDb(mongoUrl, db =>
            bidAskSimpleMovingAverage(db, this.pair, 10).then(sma =>
                this.tradeDb.getPositonsByType(WaitingOrderClosingPosition, this.pair).then(activePositions => {
                    this.tradeDb.getOrdersByTransactionId(activePositions.map(_ => _.currentTxnId)).then(sentOrders => {
                        const buyOrders = sentOrders.filter(_ => _.details instanceof BuyOrder).map(_ => _.details as Order);
                        const sellOrders = sentOrders.filter(_ => _.details instanceof SellOrder).map(_ => _.details as Order);

                        let askOrderStr = "no buy order";

                        if (buyOrders.length > 0) {
                            const closestToAsk = buyOrders.reduce((o1, o2) => {
                                if (Math.abs(parseFloat(o1.price) - sma.askSma) < Math.abs(parseFloat(o2.price) - sma.askSma)) {
                                    return o1;
                                } else {
                                    return o2;
                                }
                            }, buyOrders[0]);

                            askOrderStr = `buy at ${closestToAsk.price}, diff: ${Math.abs(parseFloat(closestToAsk.price) - sma.askSma).toFixed(8)}`;
                        }

                        logger.info(`${this.pair}: sma.ask = ${sma.askSma.toFixed(8)}, closest order: ${askOrderStr}`);

                        let bidOrderStr = "no sell order";

                        if (sellOrders.length > 0) {
                            const closestToBid = sellOrders.reduce((o1, o2) => {
                                if (Math.abs(parseFloat(o1.price) - sma.bidSma) < Math.abs(parseFloat(o2.price) - sma.bidSma)) {
                                    return o1;
                                } else {
                                    return o2;
                                }
                            }, sellOrders[0]);

                            bidOrderStr = `sell at ${closestToBid.price}, diff: ${Math.abs(parseFloat(closestToBid.price) - sma.bidSma).toFixed(8)}`;
                        }

                        logger.info(`${this.pair}: sma.bid = ${sma.bidSma.toFixed(8)}, closest order: ${bidOrderStr}`);
                    });
                })
            )
        );
    }

    createPosition(amount: number, buyOrSell: BuyOrSell, responseStrategy: ResponseStrategy, price?: number) {
        const position = new UnstartedPosition(responseStrategy, buyOrSell, this.pair, amount);

        if (price) {
            position.startingPrice = price;
        }

        return this.tradeDb.savePosition(position);
    }
}
