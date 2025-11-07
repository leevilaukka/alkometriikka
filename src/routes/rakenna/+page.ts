export async function load({ parent, params }) {
    const data = await parent();
	return data;
};