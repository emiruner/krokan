import * as assert from "assert";
import {
    FixedAbsoluteIncludingFeeStrategy, FixedRatioExcludingFeeStrategy, WaitingOrderClosingPosition,
    WaitingOrderSendingPosition
} from "./position";
import {BuyOrSell, SellOrder} from "./kraken-types";

import * as logger from "winston";
logger.remove(logger.transports.Console);

describe("WaitingOrderSendingPosition", function () {
    describe("insideRange", function () {
        it("should always return true", function () {
            const rs = new FixedRatioExcludingFeeStrategy(0.005);
            const position = new WaitingOrderSendingPosition(rs, BuyOrSell.Sell, "XXRPZUSD", 100, "123");

            assert.equal(position.insideRange(500, 0.004), true);
            assert.equal(position.insideRange(500, 0.00000000001), true);
        });
    })
});

describe("WaitingOrderClosingPosition", function () {
    describe("insideRange", function () {
        it("should always return true", function () {
            const rs = new FixedRatioExcludingFeeStrategy(0.005);
            const position = new WaitingOrderClosingPosition(rs, BuyOrSell.Sell, "XXRPZUSD", 100, "123");

            assert.equal(position.insideRange(500, 0.004), true);
            assert.equal(position.insideRange(500, 0.00000000001), true);
        });
    });

    describe("createMatchingOrder", function () {
        it("should create a sell order with price 0.10 for a buy order with price 0.08 and fixed absolute strategy with absolute 0.2", function () {
            const rs = new FixedAbsoluteIncludingFeeStrategy(0.02);
            const position = new WaitingOrderClosingPosition(rs, BuyOrSell.Sell, "XXRPZUSD", 100, "ORDER1");

            const order = new SellOrder({
                volume: "100",
                cost: "10",
                fee: "0.0001",
                averagePrice: "0.10",
                orderDescription: "some order"
            });


            const matchingOrder: any = position.createMatchingOrder(order);

            assert.equal(matchingOrder.ordertype, "limit");
            assert.equal(matchingOrder.type, "buy");
            assert.equal(matchingOrder.volume, "100");
            assert.equal(matchingOrder.price, "0.08");
        });
    });

    describe("createMatchingOrder", function () {
        it("should check if absolute diff covers fee", function () {
            const rs = new FixedAbsoluteIncludingFeeStrategy(0.02);
            const position = new WaitingOrderClosingPosition(rs, BuyOrSell.Sell, "XXRPZUSD", 100, "ORDER1");

            const order = new SellOrder({
                volume: "100",
                cost: "10",
                averagePrice: "0.10",
                orderDescription: "some order"
            });


            order.fee = "0.8";
            assert.throws(() => position.createMatchingOrder(order), "should throw for this fee");

            order.fee = "0.761";
            assert.doesNotThrow(() => position.createMatchingOrder(order), "should not throw for this fee");
        });
    });


    describe("createMatchingOrder", function () {
        it("should create a sell order with price 0.06675 for a buy order of volume 100 with price 0.08 and fee 0.2 and a gain ratio of 0.1", function () {
            const rs = new FixedRatioExcludingFeeStrategy(0.1);
            const position = new WaitingOrderClosingPosition(rs, BuyOrSell.Sell, "XXRPZUSD", 100, "ORDER1");

            const order = new SellOrder({
                volume: "100",
                cost: "8",
                fee: "0.2",
                averagePrice: "0.08",
                orderDescription: "some order"
            });


            const matchingOrder: any = position.createMatchingOrder(order);

            assert.equal(matchingOrder.ordertype, "limit");
            assert.equal(matchingOrder.type, "buy");
            assert.equal(matchingOrder.volume, "100");
            assert.equal(matchingOrder.price, "0.06675");
        });
    });
});

