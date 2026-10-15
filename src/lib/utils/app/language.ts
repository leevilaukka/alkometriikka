import { LocalStorageKeys } from '../constants/app';
import { LocalStorageManager } from './storage';

/** Whether the visitor has answered the language suggestion or picked a language in settings. */
export function languageBannerDismissed(): boolean {
	return LocalStorageManager.getItem(LocalStorageKeys.LanguageBannerDismissed) === true;
}

export function dismissLanguageBanner(): void {
	LocalStorageManager.setItem(LocalStorageKeys.LanguageBannerDismissed, true);
}
