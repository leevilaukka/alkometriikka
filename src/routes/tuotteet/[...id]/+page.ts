
export async function load({ parent, params }) {
    console.log('params', params);
    const data = await parent();
	return data;
};