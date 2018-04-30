import {mongoUrl} from "./mongo-config";
import {withDb} from "./util";
import {createKraken, withKraken} from "./kraken-util";
import {Kraken} from "./kraken-wrapper";

function getBalance(kraken: Kraken) {
    return kraken.getBalance()
        .then((balances: any[]) => {
            console.log(balances);

            return withDb(mongoUrl, db => {
                const timestamp = new Date();
                balances.forEach(balance => balance.timestamp = timestamp);

                kraken.stop();
                return db.collection("balance").insertMany(balances);
            });
        })
}

function getBalanceRetryIfFailed(kraken: Kraken) {
    getBalance(kraken).catch(error => {
        console.log(`error occured while querying balance: ${error}`);
        setTimeout(() => getBalanceRetryIfFailed(kraken), 10);
    })
}

createKraken(mongoUrl, "general").then(kraken => getBalanceRetryIfFailed(kraken));
