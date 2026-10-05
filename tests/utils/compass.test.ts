import { expect, test } from 'bun:test';
import { formatDirection, getBearing, unwrapAngle } from '$lib/utils/compass.ts';

const helsinki = { latitude: 60.1699, longitude: 24.9384 };

test('getBearing points at the cardinal directions', () => {
	expect(Math.abs(getBearing(helsinki, { ...helsinki, latitude: 61 }) - 0) < 0.01).toBeTruthy();
	expect(Math.abs(getBearing(helsinki, { ...helsinki, longitude: 26 }) - 90) < 0.5).toBeTruthy();
	expect(Math.abs(getBearing(helsinki, { ...helsinki, latitude: 59 }) - 180) < 0.01).toBeTruthy();
	expect(Math.abs(getBearing(helsinki, { ...helsinki, longitude: 24 }) - 270) < 0.5).toBeTruthy();
});

test('getBearing from Helsinki to Tampere heads north-north-west', () => {
	const bearing = getBearing(helsinki, { latitude: 61.4978, longitude: 23.761 });
	expect(bearing > 330 && bearing < 345).toBeTruthy();
});

test('formatDirection names the eight directions', () => {
	expect(formatDirection(0)).toBe('pohjoiseen');
	expect(formatDirection(359)).toBe('pohjoiseen');
	expect(formatDirection(45)).toBe('koilliseen');
	expect(formatDirection(270)).toBe('länteen');
});

test('unwrapAngle turns the short way across north', () => {
	expect(unwrapAngle(359, 1)).toBe(361);
	expect(unwrapAngle(1, 359)).toBe(-1);
	expect(unwrapAngle(100, 120)).toBe(120);
});
