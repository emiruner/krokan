import {Collection, DeleteWriteOpResultObject, FindAndModifyWriteOpResultObject} from "mongodb";
import {ObjectID} from "bson";
import {MongoUser} from "./mongo-user";
import * as logger from "winston";
import {Position} from "./position";
import {dataToObject, objectToData} from "./position-mapping";
import {BuyOrSell, Order, OrderBook, OrderStatus, TradeInfo} from "./kraken-types";
import {SentOrder, StoredUnsentOrder, UnsentOrder, WaitingForIdOrder} from "./trade-db-types";
import {ConfigEntry} from "./config-entry";

interface IConstructor<T> {
    new(...args: any[]): T;
}

export interface RawOrder {
    ordertype: string;
    volume: string;
    type: string;
    pair: string;
    price: string | undefined;
    userref: string | undefined;
}

export interface FailedOrder {
    _id: ObjectID;
    order: RawOrder;
    error: string;
}

export class TradeDb extends MongoUser {
    constructor(mongoUrl: string) {
        super(mongoUrl);
    }

    protected withCollection<T>(collectionName: string, block: (collection: Collection) => Promise<T>) {
        return super.withDb(db => block(db.collection(collectionName)))
    }

    private withConfig<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("config", block)
    }

    private withSentOrders<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("sentOrders", block)
    }

    private withUnsentOrders<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("unsentOrders", block)
    }

    private withFailedOrders<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("failedOrders", block)
    }

    private withPositions<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("positions", block)
    }

    private withTrades<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("trade", block)
    }

    private withOrderBooks<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("orderBooks", block)
    }

    private withWaitingForIdOrders<T>(block: (config: Collection) => Promise<T>) {
        return this.withCollection("waitingForIdOrders", block)
    }

    public allocateUserRef() {
        return this.withConfig(config =>
            config.findOneAndUpdate({key: 'lastUserRef'}, {$inc: {value: 1}}, {
                upsert: true,
                returnOriginal: false
            }).then((result: FindAndModifyWriteOpResultObject<ConfigEntry<string>>) => {
                if (result.value === undefined) {
                    throw new Error("value is undefined");
                }

                return result.value.value;
            })
        );
    }

    addSentOrder(userRef: string, transactionId: string) {
        return this.withSentOrders(_ => _.insertOne(objectToData(new SentOrder(userRef, transactionId))));
    }

    addUnsentOrder(userRef: string, order: any) {
        return this.withUnsentOrders(_ => _.insertOne(new UnsentOrder(userRef, order)));
    }

    getUnsentOrders(): Promise<StoredUnsentOrder[]> {
        return this.withUnsentOrders(_ => _.find().sort({_id: 1}).toArray().then(result => result as StoredUnsentOrder[]));
    }

    removeUnsentOrder(unsentOrderId: ObjectID): Promise<DeleteWriteOpResultObject> {
        return this.withUnsentOrders(_ => _.deleteOne({_id: unsentOrderId}));
    }

    getSentOrders(): Promise<SentOrder[]> {
        return this.withSentOrders(_ => _.find().toArray().then(result => this.convertDataArrayToObjectArray<SentOrder>(result)));
    }

    querySentOrdersByTransactionIds(transactionIds: string[]): Promise<SentOrder[]> {
        return this.withSentOrders(_ => _
            .find({transactionId: {$in: transactionIds}})
            .toArray()
            .then(result => this.convertDataArrayToObjectArray<SentOrder>(result))
        );
    }

    private convertDataArrayToObjectArray<T>(data: any[]): T[] {
        return data.map(raw => dataToObject(raw)) as T[];
    }

    addFailedOrder(timestamp: Date, failedOrder: any, error: any) {
        return this.withFailedOrders(_ => _
            .insertOne({
                timestamp: timestamp,
                order: failedOrder,
                error: error
            }));
    }

    savePosition(position: Position) {
        return this.withPositions(_ => _.insertOne(objectToData(position)))
    }

    updatePosition(position: Position) {
        return this.withPositions(_ => _.updateOne({_id: position._id}, objectToData(position)))
    }

    findSentOrderByUserRef(userRef: string): Promise<SentOrder | undefined> {
        return this.withSentOrders(sentOrders => sentOrders.find({userRef: userRef}).toArray().then(result => result as SentOrder[])).then(sentOrders => {
            if (sentOrders.length == 0) {
                return undefined;
            }

            if (sentOrders.length > 1) {
                logger.warn("expecting only one result but many returned");
            }

            return dataToObject(sentOrders[0]);
        });
    }

    getPositonsByType<T extends Position>(klass: IConstructor<T>, pair?: string): Promise<T[]> {
        const query: any = {_class_: klass.name};

        if(pair) {
            query.pair = pair;
        }

        return this.withPositions(_ => _
            .find(query).toArray()
            .then(arr => this.convertDataArrayToObjectArray<T>(arr))
        );
    }

    getActiveOrdersTransactionIds(): Promise<string[]> {
        return this.withSentOrders(sentOrders => sentOrders
            .find({
                $or: [
                    {"details.status": OrderStatus.Pending},
                    {"details.status": OrderStatus.Open},
                    {"details": {$exists: false}},
                ]
            })
            .project({transactionId: 1})
            .toArray()
            .then((result: { transactionId: string }[]) => result.map(info => info.transactionId))
        );
    }

    updateOrderDetails(orders: Order[]) {
        return this.withSentOrders(sentOrders =>
            Promise.all(orders.map(order => sentOrders
                .findOneAndUpdate({transactionId: order.txId}, {$set: {details: objectToData(order)}})
            ))
        );
    }

    getOrderFailureInfo(userref: string) {
        return this.withFailedOrders(_ => _
            .find({"order.userref": userref}).toArray().then((failures: FailedOrder[]) => {
                if (failures.length > 0) {
                    return failures[0].error;
                } else {
                    return undefined;
                }
            }))
    }

    getPositons(): Promise<Position[]> {
        return this.withPositions(_ => _
            .find({}).toArray()
            .then(arr => this.convertDataArrayToObjectArray<Position>(arr))
        );
    }

    saveTrades(trades: TradeInfo[]) {
        return this.withTrades(_ => _.insertMany(trades));
    }

    getTradeLast(): Promise<string | undefined> {
        return this.withConfig(_ => _
            .findOne({key: 'tradeLast'}).then((found: ConfigEntry<string>) => {
                if (found) {
                    return found.value;
                } else {
                    return undefined;
                }
            })
        )
    }

    storeTradeLast(last: string) {
        return this.withConfig(_ => _
            .findOneAndUpdate({key: 'tradeLast'}, {$set: {value: last}}, {
                upsert: true,
                returnOriginal: false
            })
        )
    }

    saveOrderBook(orderBook: OrderBook) {
        return this.withOrderBooks(_ => _.insertOne(orderBook));
    }

    getOrderBooks() {
        return this.withOrderBooks(_ => _.find({}).toArray().then(result => result as OrderBook[]))
    }

    findClosestBuySellPrice(timestamp: number): Promise<string[]> {
        return this.withTrades(trades => trades
            .find({time: {$gt: timestamp}, buySell: BuyOrSell.Buy})
            .limit(1)
            .toArray()
            .then(buy =>
                trades
                    .find({time: {$gt: timestamp}, buySell: BuyOrSell.Sell})
                    .limit(1)
                    .toArray()
                    .then(sell => {
                        return [(buy[0] as TradeInfo).price, (sell[0] as TradeInfo).price]
                    })
            )
        )
    }

    getLatestOrderBook() {
        return this.withOrderBooks(_ =>
            _
                .find()
                .sort({timestamp: -1})
                .limit(1)
                .toArray()
                .then(result => (result as OrderBook[])[0]))
    }

    getTrades(): Promise<TradeInfo[]> {
        return this.withTrades(_ => _.find().sort({timestamp: 1}).toArray().then(_ => _ as TradeInfo[])
        )
    }

    isOrderUnsent(userRef: string) {
        return this.withUnsentOrders(_ => _.find({userRef: userRef}).toArray().then(_ => _.length > 0))
    }

    findOrderByTransactionId(txnId: string): Promise<Order> {
        return this.withSentOrders(_ => _.findOne({txId: txnId}) as Promise<Order>);
    }

    findUsentOrderBySendKey(sendKey: string): Promise<any | undefined> {
        return this.withUnsentOrders(_ => _
            .find({userRef: sendKey}).toArray().then(found => {
                if (found.length > 0) {
                    return (found[0] as UnsentOrder).order;
                } else {
                    return undefined;
                }
            }));
    }

    getOrdersByTransactionId(transactionIds: string[]): Promise<SentOrder[]> {
        return this.withSentOrders(_ => _.find({transactionId: {$in: transactionIds}}).toArray().then(_ => _.map(dataToObject) as SentOrder[]))
    }

    addWaitingForIdOrder(userRef: string) {
        return this.withWaitingForIdOrders(_ => _.insertOne({userRef: userRef}))
    }

    getWaitingForIdOrders() {
        return this.withWaitingForIdOrders(_ => _.find({}).toArray().then(_ => _ as WaitingForIdOrder[]))
    }

    removeWaitingForIdOrder(id: ObjectID) {
        return this.withWaitingForIdOrders(_ => _.deleteOne({_id: id}));
    }
}
