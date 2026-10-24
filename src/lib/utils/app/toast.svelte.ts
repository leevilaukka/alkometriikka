/** A short confirmation shown at the bottom of the page, optionally with a link onwards */
export type ToastMessage = { text: string; href?: string; linkText?: string };

const TOAST_DURATION_MS = 4000;

export const toast = $state<{ current: ToastMessage | null }>({ current: null });

let timeout: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: ToastMessage) {
	toast.current = message;
	clearTimeout(timeout);
	timeout = setTimeout(hideToast, TOAST_DURATION_MS);
}

export function hideToast() {
	clearTimeout(timeout);
	toast.current = null;
}
