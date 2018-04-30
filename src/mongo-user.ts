import {Db} from "mongodb";
import {withDb} from "./util";

export class MongoUser {
    constructor(protected mongoUrl: string) {
    }

    protected withDb<T>(block: (db: Db) => Promise<T>) {
        return withDb(this.mongoUrl, block);
    }
}

