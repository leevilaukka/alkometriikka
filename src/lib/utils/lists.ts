import { lists } from "$lib/global.svelte";
import type { ListObj } from "$lib/types";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { getRandom } from "./helpers";

export function createListId() {
    return `${Date.now()}-${getRandom().split("-")[0]}`
}

export function createList(name: string) {
    const newList: ListObj = {
        id: createListId(),
        name,
        items: []
    };
    lists.push(newList);
}

export function getListById(listId: string) {
    return lists.find(list => list.id === listId);
}

export function deleteList(list: ListObj) {
    lists.splice(lists.indexOf(list), 1);
}

export function updateListName(list: ListObj, newName: string) {
    list.name = newName;
}

export function getListItem(list: ListObj, itemNumber: string) {
    const item = list.items.find(i => i.id === itemNumber);
    if (item) return item
    return null
}

export function updateQuantity(list: ListObj, itemNumber: string, newQuantity: number) {
    const item = list.items.find(i => i.id === itemNumber);
    if (item) item.q = newQuantity;
}

export function getItemQuantity(list: ListObj, itemNumber: string) {
    return list.items.find(i => i.id === itemNumber)?.q || 0;
}

export function getListTimestamp(list: ListObj) {
    const timestamp = list ? parseInt(list.id.split("-")[0]) : null;
    return timestamp ? new Date(timestamp) : null;
}

export function isInList(list: ListObj, itemNumber: string) {
    return list ? list.items.some(item => item.id === itemNumber) : false;
}

export function inLists(itemNumber: string) {
    return lists.filter(list => list.items.some(item => item.id === itemNumber)).map(list => list.id);
}

export function addToList(list: ListObj, itemNumber: string) {
    if (list.items.some(item => item.id === itemNumber)) {
        updateQuantity(list, itemNumber, (list.items.find(i => i.id === itemNumber)?.q || 0) + 1);
    } else {
        list.items.push({ id: itemNumber, q: 1 });
    }
}

export function removeFromList(list: ListObj, itemNumber: string) {
    if (list.items.some(item => item.id === itemNumber)) {
        const item = list.items.find(i => i.id === itemNumber);
        if (item) item.q -= 1;
    }
    list.items = list.items.filter(item => item.id !== itemNumber);
}

export function listToURI(list: ListObj) {
    return compressToEncodedURIComponent(JSON.stringify(list));
}

export function URIToList(uri: string) {
    try {
        const decoded = JSON.parse(decompressFromEncodedURIComponent(uri));
        return Array.isArray(decoded.items) ? decoded : null;
    } catch(e) {
        return null
    }
}

export function validateList(uri: string) {
    const list = URIToList(uri);
    if (!list) return false;

    // Check if all required fields are present
    const requiredFields = ['id', 'name', 'items'];
    for (const field of requiredFields) {
        if (!(field in list)) return false;
    }

    // Check if items are valid
    if (!Array.isArray(list.items)) return false;
    for (const item of list.items) {
        if (typeof item.id !== 'string' || typeof item.q !== 'number') return false;
    }

    return true;
}

export function saveList(list: ListObj) {
    list.id = createListId();
    lists.push(list);
}
