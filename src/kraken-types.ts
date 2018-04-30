export interface TradeSummary {
    price: string;
    wholeLotVolume?: string;
    lotVolume: string;
}

export enum BuyOrSell {
    Buy = "Buy",
    Sell = "Sell"
}

export enum MarketLimit {
    Market = "Market",
    Limit = "Limit"
}

export class TradeInfo {
    pair: string;
    price: string;
    volume: string;
    time: number;
    buySell: BuyOrSell;
    marketLimit: MarketLimit;
}

export class OrderBookEntry {
    price: string;
    volume: string;
    timestamp: number;
}

export class OrderBook {
    pair: string;
    timestamp: number;
    asks: OrderBookEntry[];
    bids: OrderBookEntry[];
}

export interface TradeStat {
    today: string;
    last24Hours: string;
}

export interface Ticker {
    pair: string;
    timestamp: number;
    ask: TradeSummary;
    bid: TradeSummary;
    lastTradeClosed: TradeSummary;
    volume: TradeStat;
    volumeWeightedAveragePrice: TradeStat;
    numberOfTrades: TradeStat;
    low: TradeStat;
    high: TradeStat;
    todaysOpeningPrice: string;
}

export interface ServerTime {
    unixtime: number;
    rfc1123: string;
}

export interface Balance {
    assetName: string;
    balance: string;
}

export const enum OrderType {
    Market,
    Limit,
    StopLoss,
    TakeProfit,
    StopLossProfit,
    StopLossProfitLimit,
    StopLossLimit,
    TakeProfitLimit,
    TrailingStop,
    TrailingStopLimit,
    StopLossAndLimit,
    SettlePosition
}

export const enum OrderFlags {
    VolumeInQuoteCurrency,
    PreferFeeInBaseCurrency,
    PreferFeeInQuoteCurrency,
    NoMarketPriceProtection,
    PostOnlyOrder
}

export const enum OrderStatus {
    Pending,
    Open,
    Closed,
    Canceled,
    Expired
}

export abstract class Order {
    txId: string;
    refId: string | undefined;
    userRef: string | undefined;
    status: OrderStatus;
    openTime: number;
    closeTime: number;
    startTime: number;
    expireTime: number;
    pair: string;
    orderType: OrderType;
    price: string;
    price2: string;
    leverage: string;
    orderDescription: string;
    closeDescription: string | undefined;
    volume: string;
    executedVolume: string;
    cost: string;
    fee: string;
    averagePrice: string;
    stopPrice: string | undefined;
    limitPrice: string | undefined;
    misc: string;
    flags: string;
    trades: Array<string>;
}

export class BuyOrder extends Order {
    public constructor(init?:Partial<BuyOrder>) {
        super();
        Object.assign(this, init);
    }
}

export class SellOrder extends Order {
    public constructor(init?:Partial<SellOrder>) {
        super();
        Object.assign(this, init);
    }
}