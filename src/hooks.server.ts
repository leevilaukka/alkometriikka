import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) =>
			dev
				? html.replace(/<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->/g, (block) =>
						block.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
					)
				: html
	});
