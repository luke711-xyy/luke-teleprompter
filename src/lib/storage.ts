import type { PersistedSettings } from "./types";

const KEY = "luke-teleprompter:settings:v1";

export const DEFAULT_SCRIPT = `在这个快节奏的时代，效率决定成效，工具的选择尤为关键。\n今天我们来看看这款产品，and why it fits naturally into your everyday workflow.\n它能够帮助团队更好地协作，并在不同场景中保持流畅的沟通。\n接下来，我们会进行实际演示，so you can see exactly how it works.`;

export const DEFAULT_SETTINGS: PersistedSettings = {
  script: DEFAULT_SCRIPT,
  mode: "follow",
  speed: 1,
  fontSize: 68,
  focusPosition: 50,
  mirrored: false,
  activeTokenIndex: 28,
};

export function loadSettings(): PersistedSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<PersistedSettings>;
    const focusPosition = typeof parsed.focusPosition === "number"
      ? Math.min(70, Math.max(30, parsed.focusPosition))
      : DEFAULT_SETTINGS.focusPosition;
    return { ...DEFAULT_SETTINGS, ...parsed, focusPosition };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: PersistedSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
