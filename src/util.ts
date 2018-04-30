import {Db, MongoClient} from "mongodb";
import * as logger from "winston";
import {LoggerInstance, Winston} from "winston";

export function closeMongoDb(db: Db) {
    db.close().catch(error => console.error("error occured while closing db: " + error));
}

export function setupStandardLog(logFile: string) {
    logger.add(logger.transports.File, {filename: logFile});
    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, {
        colorize: true, timestamp: function () {
            return localTimestampString(new Date());
        }
    });

    return logger;
}

export function withDb<T>(mongoUrl: string, block: (db: Db) => Promise<T>): Promise<T> {
    return new MongoClient().connect(mongoUrl).then(db =>
        block(db)
            .then(result => {
                closeMongoDb(db);
                return result;
            })
            .catch(error => {
                closeMongoDb(db);
                throw error;
            })
    );
}

export function dateToLocal(date: Date): Date {
    const local = new Date(date);
    local.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return local;
}

export function localTimestampString(date: Date) {
    return dateToLocal(date).toJSON().replace("T", " ").replace("Z", " ").trim();
}

export function formatPrice(price: number) {
    return price.toFixed(8)
}

export function generalErrorHandler(logger: Winston) {
    return function(error: any) {
        logger.error(error.toString())
    }
}
