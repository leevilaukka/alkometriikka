import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDirection, getBearing, unwrapAngle } from '../src/lib/utils/compass.ts';

const helsinki = { latitude: 60.1699, longitude: 24.9384 };

test('getBearing points at the cardinal directions', () => {
	assert.ok(Math.abs(getBearing(helsinki, { ...helsinki, latitude: 61 }) - 0) < 0.01);
	assert.ok(Math.abs(getBearing(helsinki, { ...helsinki, longitude: 26 }) - 90) < 0.5);
	assert.ok(Math.abs(getBearing(helsinki, { ...helsinki, latitude: 59 }) - 180) < 0.01);
	assert.ok(Math.abs(getBearing(helsinki, { ...helsinki, longitude: 24 }) - 270) < 0.5);
});

test('getBearing from Helsinki to Tampere heads north-north-west', () => {
	const bearing = getBearing(helsinki, { latitude: 61.4978, longitude: 23.761 });
	assert.ok(bearing > 330 && bearing < 345, `got ${bearing}`);
});

test('formatDirection names the eight directions', () => {
	assert.equal(formatDirection(0), 'pohjoiseen');
	assert.equal(formatDirection(359), 'pohjoiseen');
	assert.equal(formatDirection(45), 'koilliseen');
	assert.equal(formatDirection(270), 'länteen');
});

test('unwrapAngle turns the short way across north', () => {
	assert.equal(unwrapAngle(359, 1), 361);
	assert.equal(unwrapAngle(1, 359), -1);
	assert.equal(unwrapAngle(100, 120), 120);
});
