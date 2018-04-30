import {mongoUrl} from "./mongo-config";
import {createKraken} from "./kraken-util";
import {Kraken} from "./kraken-wrapper";

function cancelOrder(kraken: Kraken, order: string) {
    kraken.cancelOrder(order).catch(error => {
        console.log('error occured while canceling order');
        setTimeout(() => cancelOrder(kraken, order), 10);
    })
}

if (process.argv.length < 3) {
    console.log("please give transaction id to cancel as command line argument");
} else {
    createKraken(mongoUrl, "general").then(kraken => cancelOrder(kraken, process.argv[2]));
}
