import { SpeechActivityGate } from "./browserSpeech";
import { resampleLinear, selectWhisperLanguage, tailAudioWindow } from "./localWhisper";
import type { RecognitionLevel, RecognitionResult, RecognitionState } from "./types";

const SAMPLE_RATE = 16_000;
const AUDIO_WINDOW_SECONDS = 5;
const AUDIO_BUFFER_SECONDS = 8;
const INFERENCE_INTERVAL_MS = 1_000;

export type CloudTranscriptionCallbacks = {
  onState: (state: RecognitionState) => void;
  onLevel: (level: RecognitionLevel) => void;
  onResult: (result: RecognitionResult) => void;
};

export type CloudTranscriptionStartOptions = {
  language?: "auto" | "zh-CN" | "en-US";
};

type CloudTranscriptionResponse = {
  text?: string;
  language?: string;
  confidence?: number;
  message?: string;
};

export function cloudTranscriptionEndpoint(): string | null {
  const configured = import.meta.env.VITE_CLOUD_TRANSCRIPTION_ENDPOINT?.trim().replace(/\/+$/, "");
  return configured || null;
}

export function isCloudTranscriptionConfigured(): boolean {
  return Boolean(cloudTranscriptionEndpoint());
}

export function isRecoverableBrowserSpeechError(error: string): boolean {
  return error === "network" || error === "language-not-supported" || error === "service-not-allowed";
}

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return Math.sqrt(total / samples.length);
}

function cloudError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return new Error("麦克风权限被拒绝。请允许浏览器使用麦克风后重试。");
    if (error.name === "NotFoundError") return new Error("没有找到可用的麦克风。请检查声音输入设备。");
  }
  return error instanceof Error ? error : new Error(String(error));
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export class CloudTranscriptionSession {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private bufferedSamples = 0;
  private sampleRate = SAMPLE_RATE;
  private interval = 0;
  private running = false;
  private inferencePending = false;
  private lastText = "";
  private lastLevelEmitAt = 0;
  private isSpeech = false;
  private prompt = "";
  private language: "chinese" | "english" = "chinese";
  private abortController: AbortController | null = null;
  private readonly speechGate = new SpeechActivityGate();

  constructor(private readonly callbacks: CloudTranscriptionCallbacks, private readonly endpoint = cloudTranscriptionEndpoint()) {}

  async start(scriptOrPrompt = "", options: CloudTranscriptionStartOptions = {}): Promise<void> {
    if (!this.endpoint) throw new Error("Cloudflare 转写服务尚未配置。");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持麦克风音频采集。");

    this.stop();
    this.callbacks.onState({ state: "loading", message: "正在连接 Cloudflare 转写服务" });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("当前浏览器不支持音频处理。");
      this.audioContext = new AudioContextConstructor();
      this.sampleRate = this.audioContext.sampleRate;
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.processor.onaudioprocess = (event) => this.captureAudio(event.inputBuffer);
      source.connect(this.processor);
      this.processor.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);
      await this.audioContext.resume();

      this.prompt = scriptOrPrompt.slice(-1000);
      this.language = options.language === "zh-CN"
        ? "chinese"
        : options.language === "en-US"
          ? "english"
          : selectWhisperLanguage(scriptOrPrompt);
      this.running = true;
      this.interval = window.setInterval(() => void this.transcribeLatestWindow(), INFERENCE_INTERVAL_MS);
      this.callbacks.onState({ state: "listening", message: "Cloudflare 正在识别中文 / English" });
    } catch (error) {
      this.stop();
      throw cloudError(error);
    }
  }

  stop(): void {
    this.running = false;
    if (this.interval) window.clearInterval(this.interval);
    this.interval = 0;
    this.abortController?.abort();
    this.abortController = null;
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.processor = null;
    this.silentGain = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.chunks = [];
    this.bufferedSamples = 0;
    this.inferencePending = false;
    this.lastText = "";
    this.isSpeech = false;
    this.speechGate.reset();
    this.callbacks.onLevel({ level: 0, isSpeech: false });
  }

  private captureAudio(input: AudioBuffer): void {
    if (!this.running) return;
    const mono = new Float32Array(input.length);
    for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
      const channelData = input.getChannelData(channel);
      for (let index = 0; index < mono.length; index += 1) mono[index] += channelData[index] / input.numberOfChannels;
    }
    this.chunks.push(mono);
    this.bufferedSamples += mono.length;
    while (this.bufferedSamples > this.sampleRate * AUDIO_BUFFER_SECONDS && this.chunks.length > 1) {
      this.bufferedSamples -= this.chunks.shift()?.length ?? 0;
    }
    const now = performance.now();
    this.isSpeech = this.speechGate.update(rms(mono), false, now);
    if (now - this.lastLevelEmitAt >= 80) {
      this.lastLevelEmitAt = now;
      this.callbacks.onLevel({ level: Math.min(1, rms(mono) * 7.2), isSpeech: this.isSpeech });
    }
  }

  private latestSamples(): Float32Array {
    const combined = new Float32Array(this.bufferedSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return tailAudioWindow(combined, this.sampleRate, AUDIO_WINDOW_SECONDS);
  }

  private async transcribeLatestWindow(): Promise<void> {
    if (!this.running || this.inferencePending || !this.isSpeech || this.bufferedSamples < this.sampleRate || !this.endpoint) return;
    this.inferencePending = true;
    this.abortController = new AbortController();
    try {
      const pcm = resampleLinear(this.latestSamples(), this.sampleRate, SAMPLE_RATE);
      const query = new URLSearchParams({ prompt: this.prompt, language: this.language });
      const response = await fetch(`${this.endpoint}/v1/transcribe?${query}`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: encodeWavPcm16(pcm, SAMPLE_RATE),
        signal: this.abortController.signal,
      });
      const payload = await response.json() as CloudTranscriptionResponse;
      if (!response.ok) throw new Error(payload.message ?? "Cloudflare 转写失败。");
      const text = payload.text?.trim() ?? "";
      if (!text || text === this.lastText) return;
      this.lastText = text;
      this.callbacks.onResult({
        text,
        detectedLanguage: payload.language ?? this.language,
        confidence: payload.confidence ?? 0.8,
        isFinal: true,
      });
    } catch (error) {
      if (this.running && !(error instanceof DOMException && error.name === "AbortError")) {
        this.callbacks.onState({ state: "error", message: cloudError(error).message });
      }
    } finally {
      this.abortController = null;
      this.inferencePending = false;
    }
  }
}
