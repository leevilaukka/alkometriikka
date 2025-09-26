import { version } from "$app/environment";

export async function load({ parent }) {
    const data = await parent();
    console.log('Version:', version);
    return { data };
}