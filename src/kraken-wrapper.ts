import {
    Balance,
    Order,
    BuyOrder,
    OrderFlags,
    OrderStatus,
    OrderType,
    SellOrder,
    ServerTime,
    Ticker,
    OrderBookEntry, OrderBook
} from "./kraken-types";
import {KrakenClient, NonceSource} from "./kraken-client";

export interface OpenOrdersParams {
    trades: boolean;
    userref?: string
}

export interface ClosedOrdersParams {
    userref?: string;
    trades?: boolean;
    start?: string;
    end?: string;
    ofs?: number;
    closetime?: string;
}

export interface AddOrderResult {
    orderDescription: string;
    closeDescription?: string;
    transactionIds: Array<string>;
}

export interface AddOrderRawResult {
    descr?: {
        order: string;
        close?: string;
    };

    txid: Array<string>;
}

export interface BalanceInfo {
    assetName: string;
    balance: string;
}

function enumToApiString<T>(mapping: { [key: string]: T }, enumVal: T) {
    for (const key in mapping) {
        if (mapping[key] === enumVal) {
            return key;
        }
    }

    throw new Error('unexpected enum value: ' + enumVal + ', in: ' + mapping);
}

function apiStringToEnum<T>(mapping: { [key: string]: T }, enumStr: string) {
    if (mapping[enumStr] === undefined) {
        throw new Error('unexpected enum str: ' + enumStr + ', in: ' + mapping);
    }

    return mapping[enumStr];
}

const rawOrderTypeMapping: { [key: string]: OrderType } = {};
rawOrderTypeMapping['market'] = OrderType.Market;
rawOrderTypeMapping['limit'] = OrderType.Limit;
rawOrderTypeMapping['stop-loss'] = OrderType.StopLoss;
rawOrderTypeMapping['take-profit'] = OrderType.TakeProfit;
rawOrderTypeMapping['stop-loss-profit'] = OrderType.StopLossProfit;
rawOrderTypeMapping['stop-loss-profit-limit'] = OrderType.StopLossProfitLimit;
rawOrderTypeMapping['stop-loss-limit'] = OrderType.StopLossLimit;
rawOrderTypeMapping['take-profit-limit'] = OrderType.TakeProfitLimit;
rawOrderTypeMapping['trailing-stop'] = OrderType.TrailingStop;
rawOrderTypeMapping['trailing-stop-limit'] = OrderType.TrailingStopLimit;
rawOrderTypeMapping['stop-loss-and-limit'] = OrderType.StopLossAndLimit;
rawOrderTypeMapping['settle-position'] = OrderType.SettlePosition;

const rawOrderFlagsMapping: { [key: string]: OrderFlags } = {};
rawOrderFlagsMapping['viqc'] = OrderFlags.VolumeInQuoteCurrency;
rawOrderFlagsMapping['fcib'] = OrderFlags.PreferFeeInBaseCurrency;
rawOrderFlagsMapping['fciq'] = OrderFlags.PreferFeeInQuoteCurrency;
rawOrderFlagsMapping['nompp'] = OrderFlags.NoMarketPriceProtection;
rawOrderFlagsMapping['post'] = OrderFlags.PostOnlyOrder;

const rawOrderStatusMapping: { [key: string]: OrderStatus } = {};
rawOrderStatusMapping['pending'] = OrderStatus.Pending;
rawOrderStatusMapping['open'] = OrderStatus.Open;
rawOrderStatusMapping['closed'] = OrderStatus.Closed;
rawOrderStatusMapping['canceled'] = OrderStatus.Canceled;
rawOrderStatusMapping['expired'] = OrderStatus.Expired;

export class OrderBuilder {
    params: any = {};

    static ensureSet(param: any, msg: string) {
        if (!param) {
            throw new Error(msg);
        }
    }

    build() {
        OrderBuilder.ensureSet(this.params.pair, 'pair is required');
        OrderBuilder.ensureSet(this.params.type, 'type is required');
        OrderBuilder.ensureSet(this.params.ordertype, 'ordertype is required');
        OrderBuilder.ensureSet(this.params.volume, 'volume is required');

        if (this.params.ordertype === 'limit' && !this.params.price) {
            throw new Error('when order type is limit, price is required');
        }

        return this.params;
    }

    buy(pair: string) {
        this.params.type = 'buy';
        this.params.pair = pair;
        return this;
    }

    sell(pair: string) {
        this.params.type = 'sell';
        this.params.pair = pair;
        return this;
    }

    type(type: OrderType) {
        this.params.ordertype = enumToApiString(rawOrderTypeMapping, type);
        return this;
    }

    price(price: string) {
        this.params.price = price;
        return this;
    }

    secondaryPrice(price: string) {
        this.params.price2 = price;
        return this;
    }

    volume(volume: string) {
        this.params.volume = volume;
        return this;
    }

    leverage(leverage: string) {
        this.params.leverage = leverage;
        return this;
    }

    startTime(startTime: string) {
        this.params.starttm = startTime;
        return this;
    }

    expireTime(expireTime: string) {
        this.params.expiretm = expireTime;
        return this;
    }

    validate(validate: boolean) {
        this.params.validate = validate;
        return this;
    }

    flags(...flags: OrderFlags[]) {
        const rawFlags: Array<string> = [];
        flags.forEach(flag => rawFlags.push(enumToApiString(rawOrderFlagsMapping, flag)));

        this.params.oflags = rawFlags;

        return this;
    }
}

export class Kraken {
    kraken: any;

    constructor(apiKey: string, privateKey: string, nonceSource: NonceSource) {
        this.kraken = new KrakenClient(apiKey, privateKey, nonceSource);
    }

    private getTickersRaw(pairs: Array<string>) {
        return this.kraken.api('Ticker', {"pair": pairs.join(',')});
    }

    private static wrapRawTicker(pair: string, contents: any): Ticker {
        return {
            pair: pair,
            timestamp: Date.now(),
            ask: {price: contents.a[0], wholeLotVolume: contents.a[1], lotVolume: contents.a[2]},
            bid: {price: contents.b[0], wholeLotVolume: contents.b[1], lotVolume: contents.b[2]},
            lastTradeClosed: {price: contents.c[0], lotVolume: contents.c[1]},
            volume: {today: contents.v[0], last24Hours: contents.v[1]},
            volumeWeightedAveragePrice: {today: contents.p[0], last24Hours: contents.p[1]},
            numberOfTrades: {today: contents.t[0], last24Hours: contents.t[1]},
            low: {today: contents.l[0], last24Hours: contents.l[1]},
            high: {today: contents.h[0], last24Hours: contents.h[1]},
            todaysOpeningPrice: contents.o
        };
    };

    private static wrapRawOrder(txId: string, rawOrder: any): Order {
        const order = {
            txId: txId,
            refId: (rawOrder.refid === null ? undefined : rawOrder.refid),
            userRef: (rawOrder.userref === null ? undefined : rawOrder.userref),
            status: apiStringToEnum(rawOrderStatusMapping, rawOrder.status),
            openTime: rawOrder.opentm,
            closeTime: rawOrder.closetm,
            startTime: rawOrder.starttm,
            expireTime: rawOrder.expiretm,
            pair: rawOrder.descr.pair,
            orderType: rawOrderTypeMapping[rawOrder.descr.ordertype],
            price: rawOrder.descr.price,
            price2: rawOrder.descr.price2,
            leverage: rawOrder.descr.leverage,
            orderDescription: rawOrder.descr.order,
            closeDescription: rawOrder.descr.close,
            volume: rawOrder.vol,
            executedVolume: rawOrder.vol_exec,
            cost: rawOrder.cost,
            fee: rawOrder.fee,
            averagePrice: rawOrder.price,
            stopPrice: rawOrder.stopprice,
            limitPrice: rawOrder.limitprice,
            misc: rawOrder.misc,
            flags: rawOrder.oflags,
            trades: []
        };

        if (rawOrder.descr.type === 'sell') {
            return new SellOrder(order);
        } else if (rawOrder.descr.type === 'buy') {
            return new BuyOrder(order);
        } else {
            throw new Error('unexpected order type: ' + rawOrder.type);
        }
    }

    private static wrapRawTickers(raw: any): Array<Ticker> {
        let tickers = [];

        for (let pair in raw) {
            if (raw.hasOwnProperty(pair)) {
                tickers.push(Kraken.wrapRawTicker(pair, raw[pair]));
            }
        }

        return tickers;
    };

    public getBalanceRaw() {
        return this.kraken.api('Balance', null);
    }

    public addOrderRaw(params: any, nonce?: number): Promise<AddOrderRawResult> {
        return this.kraken.api('AddOrder', params, nonce);
    }

    public addOrder(params: any, nonce?: number): Promise<AddOrderResult> {
        return this.addOrderRaw(params, nonce).then((rawResult: any) => {
            const result: AddOrderResult = {orderDescription: rawResult.descr.order, transactionIds: rawResult.txid};

            if (rawResult.descr.close) {
                result.closeDescription = rawResult.close;
            }

            return result;
        });
    }

    public getOpenOrdersRaw(userRef: string | undefined, trades: boolean) {
        const params: OpenOrdersParams = {trades: trades};

        if (userRef !== undefined) {
            params.userref = userRef;
        }

        return this.kraken.api('OpenOrders', params);
    }

    public getClosedOrdersRaw(params: ClosedOrdersParams) {
        return this.kraken.api('ClosedOrders', params);
    }

    public queryOrdersRaw(params: any) {
        return this.kraken.api('QueryOrders', params);
    }

    public queryOrders(txid: Array<string>, trades?: boolean, userref?: string): Promise<Array<Order>> {
        const params: any = {txid: txid.join(',')};

        if (trades !== undefined) {
            params.trades = trades;
        }

        if (userref !== undefined) {
            params.userref = userref;
        }

        return this.queryOrdersRaw(params).then((rawOrders: any) => Kraken.wrapRawOrders(rawOrders));
    }

    public getOpenOrders(userRef: string | undefined = undefined, trades = false): Promise<Array<Order>> {
        return this
            .getOpenOrdersRaw(userRef, trades)
            .then((rawOrders: any) => Kraken.wrapRawOrders(rawOrders.open));
    }

    private static wrapRawOrders(rawOrders: any): Array<Order> {
        let orders = [];

        for (let txId in rawOrders) {
            if (rawOrders.hasOwnProperty(txId)) {
                orders.push(Kraken.wrapRawOrder(txId, rawOrders[txId]));
            }
        }

        return orders;
    }

    public getClosedOrders(params: ClosedOrdersParams = {}): Promise<Array<Order>> {
        return this
            .getClosedOrdersRaw(params)
            .then((rawOrders: any) => Kraken.wrapRawOrders(rawOrders.closed));
    }

    public getBalance(): Promise<BalanceInfo[]> {
        return this.getBalanceRaw().then((rawBalances: { [key: string]: string; }) => {
            let balances: BalanceInfo[] = [];

            for (let assetName in rawBalances) {
                if (rawBalances.hasOwnProperty(assetName)) {
                    balances.push({assetName: assetName, balance: rawBalances[assetName]});
                }
            }

            return balances;
        })
    }

    public getAssetPairs() {
        return this.kraken.api('AssetPairs', null);
    }

    public getTickers(pairs: Array<string>): Promise<Array<Ticker>> {
        return this.getTickersRaw(pairs).then(function (rawPairs: any) {
            return Kraken.wrapRawTickers(rawPairs);
        });
    }

    public getServerTime(): Promise<ServerTime> {
        return this.kraken.api('Time', null);
    }

    public cancelOrder(transactionId: string): Promise<any> {
        return this.kraken.api("CancelOrder", {txid: transactionId});
    }

    public stop() {
        this.kraken.stop();
    }

    tradesRaw(pair: string, since: string | undefined): Promise<any> {
        const params: any = {pair: pair};

        if (since) {
            params.since = since;
        }

        return this.kraken.api("Trades", params)
    }

    orderBookRaw(pair: string, count: number | undefined): Promise<any> {
        const params: any = {pair: pair};

        if (count) {
            params.count = count;
        }

        return this.kraken.api("Depth", params)
    }

    static rawToOrderBookEntry(rawOrder: any[]) {
        const entry = new OrderBookEntry();

        entry.price = rawOrder[0];
        entry.volume = rawOrder[1];
        entry.timestamp = (rawOrder[2] as number) * 1000;

        return entry;
    }

    orderBook(pair: string, count: number | undefined): Promise<OrderBook> {
        return this.orderBookRaw(pair, count).then((result: any) => {
            const rawOrders = result[pair];

            const orderBook = new OrderBook();

            orderBook.pair = pair;
            orderBook.timestamp = Date.now();

            orderBook.asks = (rawOrders.asks as any[][]).map(Kraken.rawToOrderBookEntry);
            orderBook.bids = (rawOrders.bids as any[][]).map(Kraken.rawToOrderBookEntry);

            return orderBook;
        });
    }


}
