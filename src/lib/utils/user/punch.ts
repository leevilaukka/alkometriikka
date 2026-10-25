import { punchDraft, punchRecipes } from '$lib/global.svelte';
import type { PunchIngredient, PunchRecipe } from '../catalog/punch';
import { createListId } from './lists';

/** Adds a package of the product to the open recipe, or one more if it's there already */
export function addProductToPunch(id: string) {
	const existing = punchDraft.ingredients.find(
		(ingredient) => ingredient.kind === 'alko' && ingredient.id === id
	);
	if (existing) existing.count += 1;
	else punchDraft.ingredients.push({ kind: 'alko', id, count: 1 });
}

export function punchCount(id: string) {
	return punchDraft.ingredients
		.filter((ingredient) => ingredient.kind === 'alko' && ingredient.id === id)
		.reduce((sum, ingredient) => sum + ingredient.count, 0);
}

const copyIngredients = (ingredients: PunchIngredient[]) =>
	ingredients.map((ingredient) => ({ ...ingredient }));

/** Replaces the open recipe, e.g. with a saved one, a template or a shared link */
export function openPunch(recipe: PunchRecipe) {
	punchDraft.name = recipe.name;
	punchDraft.glass = recipe.glass;
	punchDraft.people = recipe.people;
	punchDraft.ingredients = copyIngredients(recipe.ingredients);
}

/** Saves the open recipe under its name, over an earlier one of the same name */
export function savePunch(name: string) {
	punchDraft.name = name;
	const recipe = {
		name,
		glass: punchDraft.glass,
		people: punchDraft.people,
		ingredients: copyIngredients(punchDraft.ingredients),
		savedAt: new Date().toISOString()
	};
	const existing = punchRecipes.find((saved) => saved.name === name);
	if (existing) Object.assign(existing, recipe);
	else punchRecipes.unshift({ ...recipe, id: createListId() });
}

export function deletePunch(id: string) {
	const index = punchRecipes.findIndex((saved) => saved.id === id);
	if (index !== -1) punchRecipes.splice(index, 1);
}
