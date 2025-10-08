import { writable } from "svelte/store";
import type { ListObj, PersonalInfo } from "./types";
import { LocalStorageKeys } from "./utils/constants";

export let personalInfo: PersonalInfo = $state(localStorage.getItem(LocalStorageKeys.PersonalInfo) ? JSON.parse(localStorage.getItem(LocalStorageKeys.PersonalInfo) as string) : { gender: null, weight: null });
export let lists: ListObj[] = $state(localStorage.getItem(LocalStorageKeys.Lists) ? JSON.parse(localStorage.getItem(LocalStorageKeys.Lists) as string) : []);

export let searchQuery = writable(new URLSearchParams(location.search).get("q") || "");

export let isMobile = writable(window.matchMedia('(width < 48rem)').matches);
export let isLaptop = writable(window.matchMedia('(width < 1280px)').matches);

export let isSafari = writable(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));