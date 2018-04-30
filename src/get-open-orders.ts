import {mongoUrl} from "./mongo-config";
import {createKraken, withKraken} from "./kraken-util";
import {Kraken} from "./kraken-wrapper";

function displayOpenOrders(kraken: Kraken) {
    kraken
        .getOpenOrders()
        .then(result => result
            .sort((order1, order2) => parseFloat(order1.price) - parseFloat(order2.price))
            .forEach(order => console.log(order.txId + ": " + order.orderDescription))
        )
        .catch(error => {
            console.log("an error occured: " + error.toString().substring(0, 20) + "...");
            setTimeout(() => displayOpenOrders(kraken), 0);
        })

}

createKraken(mongoUrl, "general").then(kraken => displayOpenOrders(kraken));
