import { replaceState } from "$app/navigation";
import { isNullish } from "./helpers";

export class SearchParamsManager {
    params = new URLSearchParams();
    persistentParams = new URLSearchParams();
    mergedParams = new URLSearchParams();

    constructor(url: URL) {
        this.params = url.searchParams;
    }

    update() {
        this.mergedParams = new URLSearchParams([...this.params, ...this.persistentParams]);
        let url = window.location.pathname
        if(this.mergedParams.size) url += `?${this.mergedParams.toString()}`;
        replaceState(url, {});
    }

    reset() {
        this.params = new URLSearchParams();
    }

    addParameter(key: string, value: string) {
        if(!isNullish(value)) this.params.append(key, value) 
        else this.params.delete(key)
        return this;
    }

    setParameter(key: string, value: string) {
        if(!isNullish(value)) this.params.set(key, value) 
        else this.params.delete(key)
        return this;
    }

    setParametersFromObject(object: Record<string, string | string[]>) {
        Object.entries(object).forEach(([key, value]) => {
            this.params.delete(key)
            if(Array.isArray(value)) value.forEach(v => this.addParameter(key, v))
            else this.addParameter(key, value)
        })
        return this;
    }

    setParametersFromURL(url: URL) {
        this.params = url.searchParams
    }
    
    addPersistentParameter(key: string, value?: string) {
        this.persistentParams.append(key, value ?? "")
        return this;
    }

    setPersistentParameter(key: string, newValue: string) {
        this.persistentParams.set(key, newValue)
        return this;
    }

    getParameter(key: string) {
        return this.params.get(key)
    }

    getAllParameters(key: string) {
        return this.params.getAll(key)
    }

    getAll() {
        return this.mergedParams;
    }

    getPersistentParameter(key: string) {
        return this.persistentParams.get(key)
    }

    getAllPersistentParameters(key: string) {
        return this.persistentParams.getAll(key)
    }
}