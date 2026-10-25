/** A short confirmation shown at the bottom of the page, optionally with a link onwards */
/** `anchor` is the element the toast belongs to (a button the visitor just pressed); without one it sits at the bottom of the page */
export type ToastMessage = {
	text: string;
	href?: string;
	linkText?: string;
	anchor?: Element | null;
	/** Without an anchor: `top` puts it where the command palette was, near the top of the window */
	position?: 'top' | 'bottom';
};

/** A toast with a link stays longer, to give time to reach it */
export const toastDuration = (message: ToastMessage) => (message.href ? 4000 : 2500);

export const toast = $state<{ current: ToastMessage | null; paused: boolean }>({
	current: null,
	paused: false
});

let timeout: ReturnType<typeof setTimeout> | undefined;
let remaining = 0;
let startedAt = 0;

function startTimer() {
	startedAt = Date.now();
	clearTimeout(timeout);
	timeout = setTimeout(hideToast, remaining);
}

export function showToast(message: ToastMessage) {
	toast.current = message;
	toast.paused = false;
	remaining = toastDuration(message);
	startTimer();
}

export function hideToast() {
	clearTimeout(timeout);
	toast.current = null;
	toast.paused = false;
}

/** Holds the toast while it's being looked at (hover, focus); `resumeToast` continues from where it stopped */
export function pauseToast() {
	if (!toast.current || toast.paused) return;
	clearTimeout(timeout);
	remaining = Math.max(0, remaining - (Date.now() - startedAt));
	toast.paused = true;
}

export function resumeToast() {
	if (!toast.current || !toast.paused) return;
	toast.paused = false;
	startTimer();
}
