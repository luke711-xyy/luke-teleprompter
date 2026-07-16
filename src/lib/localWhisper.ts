import type { RecognitionLevel, RecognitionResult, RecognitionState } from "./types";
import { SpeechActivityGate } from "./browserSpeech";

const LOCAL_WHISPER_ORIGIN = "http://127.0.0.1:8788";
const WHISPER_SAMPLE_RATE = 16_000;
const AUDIO_WINDOW_SECONDS = 5;
const AUDIO_BUFFER_SECONDS = 8;
const INFERENCE_INTERVAL_MS = 1_000;

type LocalWhisperCallbacks = {
  onState: (state: RecognitionState) => void;
  onLevel: (level: RecognitionLevel) => void;
  onResult: (result: RecognitionResult) => void;
};

type LocalWhisperStartOptions = {
  language?: "auto" | "zh-CN" | "en-US";
};

type TranscriptionResponse = {
  text?: string;
  language?: string;
  confidence?: number;
  message?: string;
};

export function selectWhisperLanguage(scriptOrPrompt: string): "chinese" | "english" {
  return /[\u3400-\u9fff]/.test(scriptOrPrompt) ? "chinese" : "english";
}

export function tailAudioWindow(samples: Float32Array, sampleRate: number, seconds: number): Float32Array {
  const sampleCount = Math.max(1, Math.round(sampleRate * seconds));
  return samples.slice(Math.max(0, samples.length - sampleCount));
}

export function resampleLinear(input: Float32Array, sourceRate: number, targetRate = WHISPER_SAMPLE_RATE): Float32Array {
  if (!input.length || sourceRate <= 0 || targetRate <= 0) return new Float32Array();
  if (sourceRate === targetRate) return input.slice();

  const output = new Float32Array(Math.floor((input.length * targetRate) / sourceRate));
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    output[index] = input[left] * (1 - (position - left)) + input[right] * (position - left);
  }
  return output;
}

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return Math.sqrt(total / samples.length);
}

function localWhisperError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new Error("Chrome 没有麦克风权限。请点击地址栏左侧图标，允许麦克风后重试。");
    }
    if (error.name === "NotFoundError") return new Error("没有找到可用的麦克风。请检查声音输入设备。");
  }
  if (error instanceof TypeError) {
    return new Error("本地 Whisper 服务未运行。请在项目目录执行 npm run whisper:web 后重试。");
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function isLocalWhisperSupported(): boolean {
  return Boolean(
    "mediaDevices" in navigator
      && "getUserMedia" in navigator.mediaDevices
      && ("AudioContext" in window || "webkitAudioContext" in window),
  );
}

export class LocalWhisperSession {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private audioChunks: Float32Array[] = [];
  private bufferedSamples = 0;
  private sampleRate = WHISPER_SAMPLE_RATE;
  private interval = 0;
  private running = false;
  private inferencePending = false;
  private lastText = "";
  private lastLevelEmitAt = 0;
  private isSpeech = false;
  private prompt = "";
  private language: "chinese" | "english" = "chinese";
  private readonly speechGate = new SpeechActivityGate();

  constructor(private readonly callbacks: LocalWhisperCallbacks) {}

  async start(scriptOrPrompt = "", options: LocalWhisperStartOptions = {}): Promise<void> {
    if (!isLocalWhisperSupported()) {
      throw new Error("当前浏览器不支持本地音频采集。请使用最新版 Google Chrome。");
    }

    this.stop();
    this.callbacks.onState({ state: "loading", message: "正在连接本机 Whisper 服务" });
    await this.checkService();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("当前浏览器不支持本地音频采集。");

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
      this.callbacks.onState({ state: "listening", message: "Whisper base 正在本机识别中文 / English" });
    } catch (error) {
      this.stop();
      throw localWhisperError(error);
    }
  }

  stop(): void {
    this.running = false;
    if (this.interval) window.clearInterval(this.interval);
    this.interval = 0;
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.processor = null;
    this.silentGain = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.audioChunks = [];
    this.bufferedSamples = 0;
    this.inferencePending = false;
    this.lastText = "";
    this.isSpeech = false;
    this.speechGate.reset();
    this.callbacks.onLevel({ level: 0, isSpeech: false });
  }

  private async checkService(): Promise<void> {
    const response = await fetch(`${LOCAL_WHISPER_ORIGIN}/health`);
    if (!response.ok) throw new Error("本地 Whisper 服务未就绪。");
  }

  private captureAudio(input: AudioBuffer): void {
    if (!this.running) return;
    const mono = new Float32Array(input.length);
    for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
      const channelData = input.getChannelData(channel);
      for (let index = 0; index < mono.length; index += 1) mono[index] += channelData[index] / input.numberOfChannels;
    }
    this.audioChunks.push(mono);
    this.bufferedSamples += mono.length;
    while (this.bufferedSamples > this.sampleRate * AUDIO_BUFFER_SECONDS && this.audioChunks.length > 1) {
      const removed = this.audioChunks.shift();
      this.bufferedSamples -= removed?.length ?? 0;
    }

    const level = rms(mono);
    const now = performance.now();
    this.isSpeech = this.speechGate.update(level, false, now);
    if (now - this.lastLevelEmitAt >= 80) {
      this.lastLevelEmitAt = now;
      this.callbacks.onLevel({ level: Math.min(1, level * 7.2), isSpeech: this.isSpeech });
    }
  }

  private latestSamples(): Float32Array {
    const combined = new Float32Array(this.bufferedSamples);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return tailAudioWindow(combined, this.sampleRate, AUDIO_WINDOW_SECONDS);
  }

  private async transcribeLatestWindow(): Promise<void> {
    if (!this.running || this.inferencePending || !this.isSpeech || this.bufferedSamples < this.sampleRate) return;
    this.inferencePending = true;
    try {
      const pcm = resampleLinear(this.latestSamples(), this.sampleRate);
      const query = new URLSearchParams({ prompt: this.prompt, language: this.language });
      const response = await fetch(`${LOCAL_WHISPER_ORIGIN}/transcribe?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: pcm.buffer,
      });
      const payload = await response.json() as TranscriptionResponse;
      if (!response.ok) throw new Error(payload.message ?? "本地 Whisper 转写失败。");
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
      if (this.running) this.callbacks.onState({ state: "error", message: localWhisperError(error).message });
    } finally {
      this.inferencePending = false;
    }
  }
}
