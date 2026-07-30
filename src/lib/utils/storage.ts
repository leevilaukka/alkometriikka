import type { LocalStorageKeys } from "./constants";

type LocalStorageKey = typeof LocalStorageKeys[keyof typeof LocalStorageKeys];

export class LocalStorageManager {
    static getItem<T>(key: LocalStorageKey): T | null {
        const item = localStorage.getItem(key);
        if (item) {
            try {
                return JSON.parse(item) as T;
            } catch (e) {
                console.error(`Error parsing localStorage item for key "${key}":`, e);
                return null;
            }
        }
        return null;
    }

    static setItem<T>(key: LocalStorageKey, value: T): void {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`Error setting localStorage item for key "${key}":`, e);
        }
    }

    static appendToArrayItem<T>(key: LocalStorageKey, value: T): void {
        const currentArray = this.getItem<T[]>(key) || [];
        try {
            currentArray.push(value);
            this.setItem(key, currentArray);
        } catch (e) {
            console.error(`Error appending to localStorage array for key "${key}":`, e);
        }
    }

    static removeItem(key: LocalStorageKey): void {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(`Error removing localStorage item for key "${key}":`, e);
        }
    }
}