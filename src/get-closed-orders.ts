import {mongoUrl} from "./mongo-config";
import {localTimestampString} from "./util";
import {withKraken} from "./kraken-util";

withKraken(mongoUrl, "general", kraken =>
    kraken
        .getClosedOrders()
        .then(result => result
            .sort((order1, order2) => order1.closeTime - order2.closeTime)
            .forEach(order => console.log(localTimestampString(new Date(order.closeTime * 1000)) + ", " + order.txId + ", " +
                order.orderDescription + " fee: " + order.fee + ", cost: " + order.cost)
            )
        )
);
