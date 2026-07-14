import type { RecognitionLevel, RecognitionResult, RecognitionState } from "./types";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
  message?: string;
};

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  start(audioTrack?: MediaStreamTrack): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type BrowserSpeechCallbacks = {
  onState: (state: RecognitionState) => void;
  onLevel: (level: RecognitionLevel) => void;
  onResult: (result: RecognitionResult) => void;
};

type BrowserSpeechStartOptions = {
  language?: "auto" | "zh-CN" | "en-US";
};

function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function browserErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "麦克风权限被拒绝。请点击 Chrome 地址栏左侧的图标，将麦克风改为允许后重试。";
    }
    if (error.name === "NotFoundError") return "没有找到可用的麦克风。请检查声音输入设备。";
    if (error.name === "NotReadableError") return "麦克风正被其他程序占用，请关闭占用程序后重试。";
  }
  return error instanceof Error ? error.message : String(error);
}

function recognitionErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Chrome 没有麦克风权限。请点击地址栏左侧的图标，允许麦克风后重试。";
  }
  if (error === "audio-capture") return "没有收到麦克风输入，请检查 Chrome 的麦克风和系统声音输入。";
  if (error === "network") return "Chrome 语音识别服务暂时无法连接，请检查网络后重试。";
  if (error === "language-not-supported") return "当前 Chrome 不支持所选识别语言。";
  return `语音识别出错：${error}`;
}

export function preferredLanguage(scriptOrPrompt: string): "zh-CN" | "en-US" {
  const cjkCount = (scriptOrPrompt.match(/[\u3400-\u9fff]/g) ?? []).length;
  return cjkCount > 0 ? "zh-CN" : "en-US";
}

export function isBrowserSpeechSupported(): boolean {
  return Boolean(recognitionConstructor() && navigator.mediaDevices?.getUserMedia);
}

export class SpeechActivityGate {
  private speaking = false;
  private holdUntil = 0;
  private noiseFloor = 0.006;
  private attackFrames = 0;

  update(rms: number, serviceSpeaking: boolean, now: number): boolean {
    const safeRms = Math.max(0, Math.min(1, rms));
    if (!this.speaking && !serviceSpeaking) {
      const noiseSample = Math.min(safeRms, 0.025);
      this.noiseFloor = this.noiseFloor * 0.985 + noiseSample * 0.015;
    }

    const enterThreshold = Math.max(0.012, this.noiseFloor * 2.2);
    const keepThreshold = Math.max(0.007, this.noiseFloor * 1.35);
    if (serviceSpeaking || safeRms >= enterThreshold) {
      this.attackFrames += 1;
      if (serviceSpeaking || this.attackFrames >= 2) this.speaking = true;
      if (this.speaking) this.holdUntil = now + 900;
    } else {
      this.attackFrames = 0;
      if (this.speaking && safeRms >= keepThreshold) this.holdUntil = now + 520;
      if (this.speaking && now >= this.holdUntil) this.speaking = false;
    }
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.holdUntil = 0;
    this.attackFrames = 0;
  }
}

export class BrowserSpeechSession {
  private recognition: SpeechRecognitionLike | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame = 0;
  private watchdogTimer = 0;
  private restartTimer = 0;
  private running = false;
  private restarting = false;
  private serviceSpeaking = false;
  private lastSpeechState = false;
  private speechStartedAt = 0;
  private lastRestartAt = 0;
  private lastLevelEmitAt = 0;
  private speechGate = new SpeechActivityGate();

  constructor(private readonly callbacks: BrowserSpeechCallbacks) {}

  async start(scriptOrPrompt = "", options: BrowserSpeechStartOptions = {}): Promise<void> {
    const Recognition = recognitionConstructor();
    if (!Recognition || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持语音识别。请使用最新版 Google Chrome 打开此网页。");
    }

    this.stop();
    this.callbacks.onState({ state: "loading", message: "正在请求 Chrome 麦克风权限" });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.running = true;
      this.startLevelMeter();

      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = options.language && options.language !== "auto"
        ? options.language
        : preferredLanguage(scriptOrPrompt);
      recognition.onstart = () => {
        this.restarting = false;
        this.callbacks.onState({ state: "listening", message: "Chrome 正在识别中文 / English" });
      };
      recognition.onspeechstart = () => {
        this.serviceSpeaking = true;
        if (!this.speechStartedAt) this.speechStartedAt = performance.now();
      };
      recognition.onspeechend = () => {
        this.serviceSpeaking = false;
      };
      recognition.onresult = (event) => {
        const resultTime = performance.now();
        this.speechStartedAt = this.lastSpeechState ? resultTime : 0;
        this.callbacks.onState({ state: "listening", message: "Chrome 正在识别中文 / English" });
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const alternative = result[0];
          const text = alternative?.transcript.trim();
          if (!text) continue;
          const confidence = alternative.confidence > 0
            ? alternative.confidence
            : result.isFinal ? 0.76 : 0.58;
          this.callbacks.onResult({
            text,
            detectedLanguage: recognition.lang,
            confidence,
            isFinal: result.isFinal,
          });
        }
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        const message = recognitionErrorMessage(event.error);
        if (event.error === "network") {
          this.callbacks.onState({ state: "loading", message: `${message} 正在自动重试…` });
          this.scheduleRestart(recognition, 1200);
          return;
        }
        this.running = false;
        this.releaseAudio();
        this.callbacks.onState({ state: "error", message });
      };
      recognition.onend = () => {
        if (!this.running || this.restarting) return;
        this.scheduleRestart(recognition, 180);
      };
      this.recognition = recognition;
      this.beginRecognition(recognition);
      this.watchdogTimer = window.setInterval(() => this.checkRecognitionHealth(), 800);
    } catch (error) {
      this.stop();
      throw new Error(browserErrorMessage(error));
    }
  }

  stop(): void {
    this.running = false;
    this.restarting = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.watchdogTimer) window.clearInterval(this.watchdogTimer);
    if (this.restartTimer) window.clearTimeout(this.restartTimer);
    this.animationFrame = 0;
    this.watchdogTimer = 0;
    this.restartTimer = 0;
    this.recognition?.abort();
    this.recognition = null;
    this.releaseAudio();
    this.serviceSpeaking = false;
    this.lastSpeechState = false;
    this.speechStartedAt = 0;
    this.lastRestartAt = 0;
    this.lastLevelEmitAt = 0;
    this.speechGate.reset();
    this.callbacks.onLevel({ level: 0, isSpeech: false });
  }

  private beginRecognition(recognition: SpeechRecognitionLike): void {
    const track = this.stream?.getAudioTracks()[0];
    try {
      if (track) recognition.start(track);
      else recognition.start();
    } catch (error) {
      if (track && error instanceof TypeError) {
        recognition.start();
        return;
      }
      throw error;
    }
  }

  private scheduleRestart(recognition: SpeechRecognitionLike, delay: number): void {
    if (!this.running) return;
    this.restarting = true;
    if (this.restartTimer) window.clearTimeout(this.restartTimer);
    try {
      recognition.abort();
    } catch {
      // Recognition may already be stopped; the delayed start below still recovers it.
    }
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = 0;
      if (!this.running) return;
      try {
        this.beginRecognition(recognition);
      } catch (error) {
        this.running = false;
        this.releaseAudio();
        this.callbacks.onState({ state: "error", message: browserErrorMessage(error) });
      }
    }, delay);
  }

  private checkRecognitionHealth(): void {
    if (!this.running || !this.speechStartedAt) return;
    const now = performance.now();
    const waitingMs = now - this.speechStartedAt;
    if (waitingMs >= 3000 && waitingMs < 6200) {
      this.callbacks.onState({ state: "listening", message: "已检测到说话，正在等待 Chrome 返回转写…" });
    }
    if (waitingMs >= 6200 && now - this.lastRestartAt >= 6000 && this.recognition) {
      this.lastRestartAt = now;
      this.speechStartedAt = 0;
      this.serviceSpeaking = false;
      this.lastSpeechState = false;
      this.speechGate.reset();
      this.callbacks.onState({ state: "loading", message: "有声音但未收到转写，正在重连识别服务…" });
      this.scheduleRestart(this.recognition, 260);
    }
  }

  private releaseAudio(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
  }

  private startLevelMeter(): void {
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor || !this.stream) return;

    this.audioContext = new AudioContextConstructor();
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    this.audioContext.createMediaStreamSource(this.stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const update = () => {
      if (!this.running) return;
      analyser.getByteTimeDomainData(samples);
      let squareSum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        squareSum += normalized * normalized;
      }
      const rms = Math.sqrt(squareSum / samples.length);
      const now = performance.now();
      const isSpeech = this.speechGate.update(rms, this.serviceSpeaking, now);
      if (isSpeech && !this.lastSpeechState && !this.speechStartedAt) this.speechStartedAt = now;
      const speechChanged = isSpeech !== this.lastSpeechState;
      this.lastSpeechState = isSpeech;
      const level = Math.min(1, rms * 7.2);
      if (speechChanged || now - this.lastLevelEmitAt >= 80) {
        this.lastLevelEmitAt = now;
        this.callbacks.onLevel({ level, isSpeech });
      }
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }
}
