import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ModelProgress, ModelStatus, RecognitionLevel, RecognitionResult, RecognitionState } from "./types";

export const isTauri = (): boolean => Boolean(window.__TAURI_INTERNALS__);

export async function getModelStatus(): Promise<ModelStatus> {
  if (!isTauri()) return { state: "ready", size: 147951465, expectedSize: 147951465 };
  return invoke<ModelStatus>("get_model_status");
}

export async function downloadModel(): Promise<void> {
  return invoke("download_model");
}

export async function cancelModelDownload(): Promise<void> {
  return invoke("cancel_model_download");
}

export async function startRecognition(prompt: string): Promise<void> {
  if (!isTauri()) return;
  return invoke("start_recognition", { prompt });
}

export async function stopRecognition(): Promise<void> {
  if (!isTauri()) return;
  return invoke("stop_recognition");
}

export async function startMicrophoneTest(): Promise<void> {
  if (!isTauri()) return;
  return invoke("start_microphone_test");
}

export async function stopMicrophoneTest(): Promise<void> {
  if (!isTauri()) return;
  return invoke("stop_microphone_test");
}

export async function requestMicrophonePermission(): Promise<void> {
  if (!isTauri()) return;
  return invoke("request_microphone_permission");
}

export async function openTextFile(): Promise<{ path: string; content: string } | null> {
  if (!isTauri()) return null;
  return invoke("open_text_file");
}

export async function saveTextFile(content: string, suggestedName?: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke("save_text_file", { content, suggestedName });
}

export async function onModelProgress(callback: (payload: ModelProgress) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<ModelProgress>("model-download-progress", (event) => callback(event.payload));
}

export async function onRecognitionResult(callback: (payload: RecognitionResult) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<RecognitionResult>("recognition-result", (event) => callback(event.payload));
}

export async function onRecognitionState(callback: (payload: RecognitionState) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<RecognitionState>("recognition-state", (event) => callback(event.payload));
}

export async function onMicrophoneTestResult(callback: (payload: RecognitionResult) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<RecognitionResult>("microphone-test-result", (event) => callback(event.payload));
}

export async function onMicrophoneTestState(callback: (payload: RecognitionState) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<RecognitionState>("microphone-test-state", (event) => callback(event.payload));
}

export async function onMicrophoneTestLevel(callback: (payload: RecognitionLevel) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<RecognitionLevel>("microphone-test-level", (event) => callback(event.payload));
}
