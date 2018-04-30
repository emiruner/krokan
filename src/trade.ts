import {mongoUrl} from "./mongo-config";
import {TradeDb} from "./trade-db";
import {OrderDetailsDownloader} from "./order-details-downloader";
import {OrderSender} from "./order-sender";
import {AutoTrader} from "./auto-trader";
import {setupStandardLog} from "./util";
import {createKraken, createPersistentNonceSource} from "./kraken-util";
import {BuyOrSell, OrderFlags} from "./kraken-types";
import * as logger from "winston";
import {
    createOrder,
    FixedRatioExcludingFeeStrategy, UnstartedPosition, WaitingOrderClosingPosition,
    WaitingOrderSendingPosition
} from "./position";
import {OrderIdChecker} from "./order-id-checker";

setupStandardLog("trade.log");

function autoCreatePosition(tradeDb: TradeDb, autoTrader: AutoTrader) {
    tradeDb.getPositons().then(positions => {
        const activePositions = positions
            .filter(p => (p instanceof UnstartedPosition) || (p instanceof WaitingOrderSendingPosition) || (p instanceof WaitingOrderClosingPosition)).length;

        const threshold = 0;

        if (activePositions < threshold) {
            console.log(`active position count is ${activePositions}, threshold (${threshold}) NOT met, will create new order`);
            autoTrader.createPosition(100, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.005))
                .catch(error => console.log("an error occured: " + error))
                .then(() => setTimeout(() => autoCreatePosition(tradeDb, autoTrader), 5000))
        } else {
            console.log(`active position count is ${activePositions}, threshold (${threshold}) met, will WAIT`);
            setTimeout(() => autoCreatePosition(tradeDb, autoTrader), 5000);
        }
    })
}

class AlternatingPositionCreator {
    private lastBuyOrSell: BuyOrSell;
    private createdPositionCount: number;

    constructor(private volume: number, private count: number, private autoTrader: AutoTrader) {
        this.createdPositionCount = 0;
        this.lastBuyOrSell = BuyOrSell.Buy;
    }

    private createNextPosition = () => {
        const nextBuyOrSell = this.lastBuyOrSell === BuyOrSell.Buy ? BuyOrSell.Sell : BuyOrSell.Buy;

        logger.info(`creating position #${this.createdPositionCount + 1} of ${nextBuyOrSell} ${this.volume}`);

        this.autoTrader.createPosition(this.volume, nextBuyOrSell, new FixedRatioExcludingFeeStrategy(0.005, false)).then(() => {
            logger.info("created position #" + (this.createdPositionCount + 1));

            this.lastBuyOrSell = nextBuyOrSell;
            this.createdPositionCount += 1;

            if(this.createdPositionCount < this.count) {
                logger.info("scheduling creation of next position");
                setTimeout(this.createNextPosition, 10000)
            } else {
                logger.info(`max position count of ${this.count} reached`);
            }
        })
    };

    start() {
        this.createNextPosition();
    }
}

function main() {
    createKraken(mongoUrl, "ordering").then(orderingKraken =>
        createKraken(mongoUrl, "general").then(generalKraken => {
            const tradeDb = new TradeDb(mongoUrl);

            const orderingNonceSource = createPersistentNonceSource(mongoUrl, "ordering");
            const odd = new OrderDetailsDownloader(tradeDb, generalKraken);
            odd.schedule();

            const orderIdChecker = new OrderIdChecker(tradeDb, generalKraken);
            orderIdChecker.schedule();

            const orderSender = new OrderSender(tradeDb, orderingKraken, orderingNonceSource);
            orderSender.scheduleAutoResend();

            // const autoTrader = new AutoTrader(tradeDb, orderSender, 'XXRPZUSD');
            // autoTrader.checkPositonsScheduler();

            //const positionGenerator = new AlternatingPositionCreator(50, 4, autoTrader);
            // positionGenerator.start();

            // const autoTraderXbtUsd = new AutoTrader(tradeDb, orderSender, 'XXBTZUSD');
            // autoTraderXbtUsd.checkPositonsScheduler();

            // autoTraderXbtUsd.createPosition(0.002, BuyOrSell.Sell, new FixedRatioExcludingFeeStrategy(0.005, false), 4100);

            // const autoTraderXbt = new AutoTrader(tradeDb, orderSender, 'c');
            // autoTraderXbt.checkPositonsScheduler();

            // scheduleCreateRandomPosition();

            // autoCreatePosition(tradeDb, autoTrader);

            // autoTraderXbt.createPosition(500, BuyOrSell.Sell, new FixedRatioExcludingFeeStrategy(0.005, false));
            // for(let i = 0; i < 4; ++i) {
            //     autoTrader.createPosition(100, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.005, false), 0.181 - (0.001 * i));
            // }
            // autoTrader.createPosition(200, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.5, false), 0.15);

            // autoTrader.createPosition(200, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.005, false));

            // return autoTrader.createPosition(500, BuyOrSell.Sell, new FixedRatioExcludingFeeStrategy(0.005, false), 0.223337);
            // return autoTrader.createPosition(100, BuyOrSell.Sell, new FixedRatioExcludingFeeStrategy(0.005, false));
            // autoTrader.createPosition(70, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.5));
            // autoTrader.createPosition(1, BuyOrSell.Buy, new FixedRatioExcludingFeeStrategy(0.007));
        })
    )
}

main();

