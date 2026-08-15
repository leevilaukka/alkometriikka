import { redirect } from "@sveltejs/kit";

export async function load({ parent, params }) {
    const id = params.id?.split('/')[0];
    if (!id) {
        throw redirect(300, "/");
    } else {
        throw redirect(300, `/tuotteet/${id}/`);
    }  
}
 