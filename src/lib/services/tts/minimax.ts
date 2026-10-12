import type {
	TTSOptions,
	TTSSpeakResult
} from './index.ts';
import { getSharedAudioContext, type ITTSProvider, type StreamOptions } from './index.ts';
import { providerErrorMessage } from './provider-utils.ts';

function ensureTrailingSlash(url: string): string {
	return url.endsWith('/') ? url : url + '/';
}

/**
 * Build the request body for MiniMax's /v1/t2a_v2 speech endpoint. MiniMax
 * has its own format (voice_setting/audio_setting), not OpenAI's
 * model/input fields. Pure function, exported for unit tests.
 * 来源: platform.minimax.cn/docs/api-reference/speech-t2a-http (official cURL)
 */
export function buildMinimaxTTSRequestBody(
	model: string,
	text: string,
	voiceId: string,
	speed: number
): string {
	return JSON.stringify({
		model,
		text,
		stream: false,
		voice_setting: {
			voice_id: voiceId,
			speed,
			vol: 1,
			pitch: 0
		},
		audio_setting: {
			sample_rate: 32000,
			bitrate: 128000,
			format: 'mp3',
			channel: 1
		}
	});
}

/** Decode MiniMax's hex-encoded audio payload into raw bytes. Pure function. */
export function decodeHexAudio(hex: string): ArrayBuffer {
	const buffer = new ArrayBuffer(hex.length / 2);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return buffer;
}

/** Normalize a non-zero base_resp into the shape extractDetail() reads. */
export function minimaxBusinessError(provider: string, baseResp: unknown): Error {
	const resp = (baseResp ?? {}) as { status_code?: number; status_msg?: string };
	return new Error(providerErrorMessage(provider, resp.status_code ?? 0, { message: resp.status_msg }));
}

export class MiniMaxTTS implements ITTSProvider {
	private apiKey: string;
	private voiceId: string;
	private model: string;
	private speed: number;
	private baseUrl: string;

	readonly capabilities = {
		streaming: false,
		emotion: false,
		multilingual: true
	};

	constructor(options: TTSOptions) {
		this.apiKey = options.apiKey || '';
		this.voiceId = options.voiceId || 'female-shaonv';
		this.model = options.model || 'speech-2.8-turbo';
		this.speed = options.speed ?? 1;
		this.baseUrl = ensureTrailingSlash(options.baseUrl || 'https://api.minimax.cn/');
	}

	getAudioContext() {
		return getSharedAudioContext();
	}

	async speak(text: string): Promise<TTSSpeakResult> {
		const audioBuffer = await this.fetchAudioBuffer(text);
		return this.playAudioBuffer(audioBuffer);
	}

	async fetchAudioBuffer(text: string, options?: StreamOptions): Promise<AudioBuffer> {
		const response = await fetch(`${this.baseUrl}v1/t2a_v2`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`
			},
			body: buildMinimaxTTSRequestBody(
				this.model,
				text,
				options?.voiceId || this.voiceId,
				options?.speed ?? this.speed
			),
			signal: options?.signal
		});

		if (!response.ok) {
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				// non-JSON error body
			}
			throw new Error(providerErrorMessage('MiniMax', response.status, body));
		}

		const json = await response.json();
		if (json?.base_resp?.status_code !== 0) {
			throw minimaxBusinessError('MiniMax', json.base_resp);
		}

		const arrayBuffer = decodeHexAudio(json?.data?.audio ?? '');
		if (arrayBuffer.byteLength === 0) {
			throw new Error('MiniMax returned an empty audio payload');
		}

		const audioContext = this.getAudioContext();

		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}

		return audioContext.decodeAudioData(arrayBuffer);
	}

	private playAudioBuffer(audioBuffer: AudioBuffer): TTSSpeakResult {
		const audioContext = this.getAudioContext();

		// MiniMax applies speed server-side via voice_setting.speed.
		const source = audioContext.createBufferSource();
		source.buffer = audioBuffer;

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		source.connect(analyser);
		analyser.connect(audioContext.destination);

		source.start(0);

		return { source, analyser };
	}
}