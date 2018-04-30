import {mongoUrl} from "./mongo-config";
import {withDb} from "./util";
import {bidAskSimpleMovingAverage} from "./stat-util";

let pair = "XXRPZUSD";

if (process.argv.length > 2) {
    pair = process.argv[2];
}

let width = 50;

if (process.argv.length > 3) {
    width = parseInt(process.argv[3]);
}

let gain = 0.007;

if (process.argv.length > 4) {
    gain = parseFloat(process.argv[4]);
}

let fee = 0.0016;

if(process.argv.length > 5) {
    fee = parseFloat(process.argv[5]);
}

const totalGain = gain + fee;

console.log("pair       : " + pair);
console.log("width      : " + width);
console.log("gain       : " + gain);
console.log("fee        : " + fee);
console.log("totalGain  : " + totalGain);

function calcDiff(amount: number, rate: number) {
    return amount + amount * rate;
}

withDb(mongoUrl, db =>
    bidAskSimpleMovingAverage(db, pair, width).then(sma => {
        console.log("ask - gain : " + calcDiff(sma.askSma, -totalGain).toFixed(6));
        console.log("ask        : " + sma.askSma.toFixed(6));
        console.log("ask + gain : " + calcDiff(sma.askSma, totalGain).toFixed(6));
        console.log("bid - gain : " + calcDiff(sma.bidSma, -totalGain).toFixed(6));
        console.log("bid        : " + sma.bidSma.toFixed(6));
        console.log("bid + gain : " + calcDiff(sma.bidSma, totalGain).toFixed(6));
    })).catch(error => console.log("an error occured: " + error));
