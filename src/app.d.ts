// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		sa_event: (eventName: string, eventParams?: Record<string, any>) => void | undefined;
		umami: { 
			track: (nameOrPayload: string | {}, data?: Record<string, any>) => void | undefined;
			identify: (userIdOrData: string | Record<string, any>, data?: Record<string, any>) => void | undefined
		 } | undefined;
	}
}
export {};
