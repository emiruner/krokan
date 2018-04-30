import {
    FailedPosition,
    FixedAbsoluteIncludingFeeStrategy, FixedRatioExcludingFeeStrategy, Position, StoppedPosition,
    UnstartedPosition, WaitingOrderClosingPosition, WaitingOrderSendingPosition
} from "./position";
import {BuyOrder, SellOrder} from "./kraken-types";
import {SentOrder} from "./trade-db-types";

export const objectToRawDataMapping: {[name: string]: (src: any) => any} = {};

function basicObjectToRaw(src: any) {
    const target: any = {};

    target._class_ = src.constructor.name;
    Object.assign(target, src);

    return target;
}

objectToRawDataMapping[FixedRatioExcludingFeeStrategy.name] = basicObjectToRaw;
objectToRawDataMapping[FixedAbsoluteIncludingFeeStrategy.name] = basicObjectToRaw;

const positionToRaw = (src: Position) => {
    const target = basicObjectToRaw(src);
    target.responseStrategy = objectToData(src.responseStrategy);
    return target;
};

objectToRawDataMapping[UnstartedPosition.name] = positionToRaw;
objectToRawDataMapping[WaitingOrderSendingPosition.name] = positionToRaw;
objectToRawDataMapping[WaitingOrderClosingPosition.name] = positionToRaw;
objectToRawDataMapping[FailedPosition.name] = positionToRaw;
objectToRawDataMapping[StoppedPosition.name] = positionToRaw;

objectToRawDataMapping[BuyOrder.name] = basicObjectToRaw;
objectToRawDataMapping[SellOrder.name] = basicObjectToRaw;

objectToRawDataMapping[SentOrder.name] = (src: SentOrder) => {
    const target = basicObjectToRaw(src);

    if(src.details) {
        target.details = objectToData(src.details);
    }

    return target;
};

export function objectToData(src: any) {
    if(src === null || src === undefined) {
        return src;
    }

    if(!src.constructor.name) {
        throw new Error("objectToData: constructor.name is missing on: " + JSON.stringify(src));
    }

    return objectToRawDataMapping[src.constructor.name](src);
}

export const rawDataToObjectMapping: {[name: string]: (src: any) => any} = {};

rawDataToObjectMapping[FixedRatioExcludingFeeStrategy.name] = function(src: FixedRatioExcludingFeeStrategy) {
    return new FixedRatioExcludingFeeStrategy(src.ratio, src.repeat);
};

rawDataToObjectMapping[FixedAbsoluteIncludingFeeStrategy.name] = function(src: FixedAbsoluteIncludingFeeStrategy) {
    return new FixedAbsoluteIncludingFeeStrategy(src.absolute, src.repeat);
};

rawDataToObjectMapping[BuyOrder.name] = function (src: BuyOrder) {
    return new BuyOrder(src);
};

rawDataToObjectMapping[SellOrder.name] = function (src: SellOrder) {
    return new SellOrder(src);
};

rawDataToObjectMapping[SentOrder.name] = function (src: SentOrder) {
    const target = new SentOrder(src.userRef, src.transactionId);

    if(src.details) {
        target.details = dataToObject(src.details);
    }

    return target;
};

function setCommonPositionProperties(target: Position, src: Position) {
    target._id = src._id;

    if(src.startingPrice) {
        target.startingPrice = src.startingPrice;
    }

    if(src.completedTransactions) {
        target.completedTransactions = src.completedTransactions;
    }

    return target;
}

rawDataToObjectMapping[UnstartedPosition.name] = function(src: UnstartedPosition) {
    return setCommonPositionProperties(
        new UnstartedPosition(dataToObject(src.responseStrategy), src.startingType, src.pair, src.volume),
        src
    );
};

rawDataToObjectMapping[WaitingOrderSendingPosition.name] = function(src: WaitingOrderSendingPosition) {
    return setCommonPositionProperties(
        new WaitingOrderSendingPosition(dataToObject(src.responseStrategy), src.startingType, src.pair, src.volume, src.sendOrderKey),
        src
    );
};

rawDataToObjectMapping[WaitingOrderClosingPosition.name] = function(src: WaitingOrderClosingPosition) {
    return setCommonPositionProperties(
        new WaitingOrderClosingPosition(dataToObject(src.responseStrategy), src.startingType, src.pair, src.volume, src.currentTxnId),
        src
    );
};

rawDataToObjectMapping[FailedPosition.name] = function(src: FailedPosition) {
    return setCommonPositionProperties(
        new FailedPosition(dataToObject(src.responseStrategy), src.startingType, src.pair, src.volume, src.error),
        src
    );
};

rawDataToObjectMapping[StoppedPosition.name] = function(src: StoppedPosition) {
    return setCommonPositionProperties(
        new StoppedPosition(dataToObject(src.responseStrategy), src.startingType, src.pair, src.volume, src.detail),
        src
    );
};

export function dataToObject(src: any) {
    if(src === null || src === undefined) {
        return src;
    }

    if(!src._class_) {
        throw new Error(`dataToObject: src does not contain _class_ field: ${JSON.stringify(src)}`)
    }

    return rawDataToObjectMapping[src._class_](src);
}

