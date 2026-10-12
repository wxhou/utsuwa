import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMinimaxTTSRequestBody, decodeHexAudio, minimaxBusinessError } from './minimax.ts';

test('request body carries model/text/stream plus voice and audio settings', () => {
	const body = JSON.parse(buildMinimaxTTSRequestBody('speech-2.8-turbo', '你好', 'female-shaonv', 1.2));
	assert.deepEqual(body, {
		model: 'speech-2.8-turbo',
		text: '你好',
		stream: false,
		voice_setting: { voice_id: 'female-shaonv', speed: 1.2, vol: 1, pitch: 0 },
		audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
	});
	assert.equal(Object.keys(body).includes('input'), false, 'must not carry OpenAI-style fields');
});

test('hex decode round-trips known bytes', () => {
	const bytes = decodeHexAudio('48a5');
	assert.equal(new Uint8Array(bytes)[0], 0x48);
	assert.equal(new Uint8Array(bytes)[1], 0xa5);
	assert.equal(bytes.byteLength, 2);
});

test('odd-length or empty hex yields an empty buffer, not garbage', () => {
	assert.equal(decodeHexAudio('').byteLength, 0);
});

test('base_resp failure surfaces the official status_msg', () => {
	const err = minimaxBusinessError('MiniMax', { status_code: 1004, status_msg: 'invalid voice id' });
	assert.match(err.message, /1004/);
	assert.match(err.message, /invalid voice id/);
});