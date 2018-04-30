import {mongoUrl} from "./mongo-config";
import {BuyOrder, SellOrder} from "./kraken-types";
import {withKraken} from "./kraken-util";

withKraken(mongoUrl, "general", kraken => kraken.getClosedOrders({})
    .then(result => {
        const sorted = result.sort((order1, order2) => order1.closeTime - order2.closeTime);
        let xrp = 0;
        let usd = 0;

        for(let i = 0; i < sorted.length; ++i) {
            const order = sorted[i];

            if(order instanceof SellOrder) {
                xrp -= parseFloat(order.volume);
                usd += parseFloat(order.cost) - parseFloat(order.fee);
            } else if(order instanceof BuyOrder) {
                xrp += parseFloat(order.volume);
                usd -= parseFloat(order.cost) + parseFloat(order.fee);
            } else {
                console.log("unexpected order:" + order);
            }
        }

        console.log(`xrp = ${xrp}, usd = ${usd}`);
    })
);
