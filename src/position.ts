import {BuyOrder, BuyOrSell, Order, OrderFlags, OrderType, SellOrder} from "./kraken-types";
import {ObjectID} from "bson";
import {OrderBuilder} from "./kraken-wrapper";
import {formatPrice} from "./util";
import * as logger from "winston";

export interface ResponseStrategy {
    repeat: boolean,
    priceDiff(price: number, volume: number, fee: number): number
}

const feeCoefficient = 2.625; // This is enough to cover sell + buy fee combined

export class FixedRatioExcludingFeeStrategy implements ResponseStrategy {
    constructor(public ratio: number, public repeat: boolean = false) {
    }

    priceDiff(price: number, volume: number, fee: number) {
        return price * this.ratio + feeCoefficient * fee / volume;
    }
}

export class FixedAbsoluteIncludingFeeStrategy implements ResponseStrategy {
    constructor(public absolute: number, public repeat: boolean = false) {
    }

    priceDiff(price: number, volume: number, fee: number) {
        const feePerVolume = fee / volume;

        if (this.absolute * volume <= (fee * feeCoefficient)) {
            throw new Error(`price difference ${this.absolute} does not cover fee ${feePerVolume}`)
        }

        return this.absolute;
    }
}

export abstract class Position {
    _id?: ObjectID;
    responseStrategy: ResponseStrategy;
    startingType: BuyOrSell;
    pair: string;
    volume: number;
    startingPrice?: number;
    completedTransactions: string[];

    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number) {
        this.responseStrategy = responseStrategy;
        this.startingType = startingType;
        this.pair = pair;
        this.volume = volume;
        this.completedTransactions = [];
    }

    copyCommonOptionalPropertiesTo<T extends Position>(target: T) {
        target._id = this._id;
        target.startingPrice = this.startingPrice;
        target.completedTransactions = this.completedTransactions;

        return target;
    }

    gotoWaitingSend(sendKey: string) {
        return this.copyCommonOptionalPropertiesTo(
            new WaitingOrderSendingPosition(this.responseStrategy, this.startingType, this.pair, this.volume, sendKey)
        );
    }

    gotoFailed(info: string) {
        return this.copyCommonOptionalPropertiesTo(
            new FailedPosition(this.responseStrategy, this.startingType, this.pair, this.volume, info)
        );
    }

    insideRange(targetPrice: number, range: number) {
        logger.debug("insideRange: checking for targetPrice: " + targetPrice);

        if (this.startingPrice) {
            if (Math.abs(targetPrice - this.startingPrice) < range) {
                logger.debug("insideRange: starting price matched: " + this.startingPrice);
                return true;
            }

            const priceDiff = this.responseStrategy.priceDiff(this.startingPrice, this.volume, 0);
            const responsePrice = this.startingPrice + (priceDiff * (this.startingType === BuyOrSell.Buy ? 1 : -1));

            if (Math.abs(targetPrice - responsePrice) < range) {
                logger.debug("insideRange: response price matched: " + responsePrice);
                return true;
            } else {
                logger.debug("insideRange: response price NOT matched: " + responsePrice);
                return Math.abs(targetPrice - responsePrice) < range;
            }
        } else {
            // If there is no starting price then assume that this target price is range
            logger.debug("insideRange: no starting price yet, assuming target price in range: " + targetPrice);
            return true;
        }
    }
}

export function createOrder(pair: string, volume: number, buyOrSell: BuyOrSell, startingPrice?: number, ...flags: OrderFlags[]) {
    const orderBuilder = new OrderBuilder()
        .volume(volume.toString());

    switch (buyOrSell) {
        case BuyOrSell.Buy:
            orderBuilder.buy(pair);
            break;

        case BuyOrSell.Sell:
            orderBuilder.sell(pair);
            break;

        default:
            throw new Error("invalid order type: " + buyOrSell);
    }

    if (startingPrice) {
        orderBuilder.type(OrderType.Limit);
        orderBuilder.price(formatPrice(startingPrice));
    } else {
        orderBuilder.type(OrderType.Market)
    }

    orderBuilder.flags(...flags);
    return orderBuilder.build();
}

export class UnstartedPosition extends Position {
    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number) {
        super(responseStrategy, startingType, pair, volume);
    }

    createOrder() {
        return createOrder(this.pair, this.volume, this.startingType, this.startingPrice);
    }
}

export class WaitingOrderSendingPosition extends Position {
    sendOrderKey: string; // last sent order key which is not confirmed

    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number, sendOrderKey: string) {
        super(responseStrategy, startingType, pair, volume);
        this.sendOrderKey = sendOrderKey;
    }

    gotoWaitingClose(transactionId: string) {
        return this.copyCommonOptionalPropertiesTo(
            new WaitingOrderClosingPosition(this.responseStrategy, this.startingType, this.pair, this.volume, transactionId)
        );
    }
}

export class WaitingOrderClosingPosition extends Position {
    currentTxnId: string; // last transaction id waiting for this position

    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number, currentTxnId: string) {
        super(responseStrategy, startingType, pair, volume);
        this.currentTxnId = currentTxnId;
    }

    gotoWaitingSendAfterClose(sendKey: string, closedOrder: Order): WaitingOrderSendingPosition {
        if (!this.startingPrice && this.completedTransactions.length == 0) {
            this.startingPrice = parseFloat(closedOrder.averagePrice);
        }

        this.completedTransactions.push(this.currentTxnId);

        return this.gotoWaitingSend(sendKey);
    }

    gotoStoppedAfterMatchingOrderClosed() {
        this.completedTransactions.push(this.currentTxnId);

        return this.copyCommonOptionalPropertiesTo(
            new StoppedPosition(this.responseStrategy, this.startingType, this.pair, this.volume, "matching order closed")
        );
    }

    gotoStoppedAfterMatchingOrderCancelled() {
        return this.copyCommonOptionalPropertiesTo(
            new StoppedPosition(this.responseStrategy, this.startingType, this.pair, this.volume, "user cancelled order")
        );
    }

    createMatchingOrder(order: Order) {
        logger.info("creating matching order for closed order: " + order.orderDescription);

        const averagePrice = parseFloat(order.averagePrice);
        const priceDiff = this.responseStrategy.priceDiff(averagePrice, parseFloat(order.volume), parseFloat(order.fee));

        let orderBuilder = new OrderBuilder()
            .type(OrderType.Limit)
            .volume(order.volume);

        const priceDigits = this.pair === "XXRPZUSD" ? 5 : 6;

        if (order instanceof SellOrder) {
            orderBuilder.buy(this.pair).price((averagePrice - priceDiff).toFixed(priceDigits));
        } else if (order instanceof BuyOrder) {
            orderBuilder.sell(this.pair).price((averagePrice + priceDiff).toFixed(priceDigits));
        } else {
            throw new Error("unexpected order: " + order);
        }

        return orderBuilder.build();
    }
}

export class FailedPosition extends Position {
    error: string;

    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number, error: string) {
        super(responseStrategy, startingType, pair, volume);
        this.error = error;
    }
}

export class StoppedPosition extends Position {
    detail: string;

    constructor(responseStrategy: ResponseStrategy, startingType: BuyOrSell, pair: string, volume: number, detail: string) {
        super(responseStrategy, startingType, pair, volume);
        this.detail = detail;
    }
}