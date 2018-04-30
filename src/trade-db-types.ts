import {Order} from "./kraken-types";
import {ObjectID} from "bson";

export class UnsentOrder {
    constructor(public userRef: string, public order: any) {
    }
}

export class StoredUnsentOrder extends UnsentOrder {
    constructor(userRef: string, order: any, public id: ObjectID) {
        super(userRef, order);
        this._id = id;
    }

    _id: ObjectID;
}

export class WaitingForIdOrder {
    _id: ObjectID;
    userRef: string;
}

export class SentOrder {
    constructor(public userRef: string, public transactionId: string) {
    }

    details?: Order;
}

