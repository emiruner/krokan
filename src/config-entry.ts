import {ObjectID} from "bson";

export interface ConfigEntry<T> {
    _id: ObjectID;
    key: string;
    value: T;
}

