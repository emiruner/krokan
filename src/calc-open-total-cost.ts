import {mongoUrl} from "./mongo-config";
import {BuyOrder, SellOrder} from "./kraken-types";
import {withKraken} from "./kraken-util";

withKraken(mongoUrl, "general", kraken => kraken.getOpenOrders()
    .then(result => {
        let totalBuys = 0;
        let totalSells = 0;

        for (let order of result) {
            if (order instanceof BuyOrder) {
                totalBuys += parseFloat(order.price) * parseFloat(order.volume);
            } else if (order instanceof SellOrder) {
                totalSells += parseFloat(order.volume);
            } else {
                console.log("unexpected order: " + order);
            }
        }

        console.log("total buys = " + totalBuys);
        console.log("total sells = " + totalSells);
    })
);
