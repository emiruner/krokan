import {Kraken} from "./kraken-wrapper";
import {PersistentNonceSource} from "./persistent-nonce-source";
import {withDb} from "./util";

interface ApiConfigEntry {
    keyName: string;
    value: {
        apiKey: string;
        secret: string;
        freeNonceStart: number;
    }
}

export function createPersistentNonceSource(mongoUrl: string, keyName: string) {
    return new PersistentNonceSource(mongoUrl, "apicfg", keyName)
}

export function createKraken(mongoUrl: string, keyName: string) {
    return withDb(mongoUrl, db =>
        db
            .collection("apicfg")
            .findOne({keyName: keyName})
            .then((apiAccess: ApiConfigEntry) =>
                new Kraken(apiAccess.value.apiKey, apiAccess.value.secret, createPersistentNonceSource(mongoUrl, keyName))
            )
    );
}

export function withKraken<T>(mongoUrl: string, keyName: string, block: (kraken: Kraken) => Promise<T>) {
    return createKraken(mongoUrl, keyName).then(kraken =>
        block(kraken)
            .then(result => {
                kraken.stop();
                return result;
            })
            .catch(error => {
                kraken.stop();
                throw error;
            })
    );
}

export function createPublicKraken() {
    return new Kraken('', '', {
        newNonce() {
            return Promise.resolve(0);
        }
    });
}

