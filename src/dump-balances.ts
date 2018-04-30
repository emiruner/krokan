import {mongoUrl} from "./mongo-config";
import {withDb} from "./util";

withDb(mongoUrl, db => {
    return db
        .collection("balance")
        .find({$or: [{assetName: 'XXRP'}, {assetName: 'ZUSD'}]})
        .sort({timestamp: 1})
        .toArray()
        .then(balances => {
            let avgBalance: number | undefined = undefined;

            balances.forEach(balance => {
                console.log(balance);

                let avg = 0;

                if(balance.assetName === 'XXRP') {
                    avg = parseFloat(balance.balance) * 0.24;
                } else if(balance.assetName === 'ZUSD') {
                    avg = parseFloat(balance.balance);
                } else {
                    throw new Error("unexpected: " + balance.assetName);
                }

                if(avgBalance) {
                    avgBalance += avg;
                    console.log(`timestamp: ${balance.timestamp}, avg = ${avgBalance}`);
                    avgBalance = undefined;
                } else {
                    avgBalance = avg;
                }
            });
        });
});
