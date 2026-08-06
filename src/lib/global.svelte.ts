import { writable } from "svelte/store";
import type { ListObj, PersonalInfo } from "./types";
import { LocalStorageKeys } from "./utils/constants";
import { LocalStorageManager } from "./utils/storage";

export let personalInfo: PersonalInfo = $state(LocalStorageManager.getItem(LocalStorageKeys.PersonalInfo) || { gender: null, weight: null, time: 2 });
export let lists: ListObj[] = $state(LocalStorageManager.getItem(LocalStorageKeys.Lists) || []);

export let searchQuery = writable(new URLSearchParams(location.search).get("q") || "");

export let theme = writable(LocalStorageManager.getItem<string>(LocalStorageKeys.Theme) ?? "");

export let isMobile = writable(window.matchMedia('(width < 48rem)').matches);
export let isLaptop = writable(window.matchMedia('(width < 1280px)').matches);

export let isSafari = writable(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
export let isFirefox = writable(navigator.userAgent.toLowerCase().indexOf('firefox') > -1);
export let isChrome = writable(navigator.userAgent.toLowerCase().indexOf('chrome') > -1);