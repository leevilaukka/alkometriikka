import type { PersonalInfo } from "./types";
import { LocalStorageKeys } from "./utils/constants";

export let personalInfo: PersonalInfo = $state(localStorage.getItem(LocalStorageKeys.PersonalInfo) ? JSON.parse(localStorage.getItem(LocalStorageKeys.PersonalInfo) as string) : { gender: null, weight: null });