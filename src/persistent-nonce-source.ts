import {NonceSource} from "./kraken-client";
import {MongoUser} from "./mongo-user";

const nonceBlockSize = 10;

export class PersistentNonceSource extends MongoUser implements NonceSource {
    lastNonce: number | undefined = undefined;
    nonceLimit: number | undefined = undefined;
    lastUpdatePromise: Promise<number> | undefined;

    constructor(mongoUrl: string, private configCollectionName: string, private key: string) {
        super(mongoUrl);
    }

    newNonce(): Promise<number> {
        if (this.lastUpdatePromise) {
            return this.lastUpdatePromise.then(() => this.newNonce());
        }

        if (this.lastNonce && ((this.lastNonce + 1) < (this.nonceLimit as number))) {
            ++this.lastNonce;
            return Promise.resolve(this.lastNonce);
        }

        return this.lastUpdatePromise = this.withDb(db =>
            db
                .collection(this.configCollectionName)
                .findOneAndUpdate({keyName: this.key}, {$inc: {'value.freeNonceStart': nonceBlockSize}}, {})
                .then((original: any) => {
                    this.lastNonce = original.value.value.freeNonceStart as number;
                    this.nonceLimit = this.lastNonce + nonceBlockSize;
                    this.lastUpdatePromise = undefined;

                    return this.lastNonce;
                })
        );
    }
}