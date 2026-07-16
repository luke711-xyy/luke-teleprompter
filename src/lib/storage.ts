import type { PersistedSettings } from "./types";
import {
  DIM_STRENGTH_MAX,
  DIM_STRENGTH_MIN,
  FOCUS_BAND_HEIGHT_MAX,
  FOCUS_BAND_HEIGHT_MIN,
  FOCUS_BAND_HEIGHT_DEFAULT,
  FOCUS_POSITION_MAX,
  FOCUS_POSITION_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  SIDE_PADDING_MAX,
  SIDE_PADDING_MIN,
} from "./settingsBounds";

const KEY = "luke-teleprompter:settings:v1";

export const DEFAULT_SCRIPT = `在这个快节奏的时代，效率决定成效，工具的选择尤为关键。\n今天我们来看看这款产品，and why it fits naturally into your everyday workflow.\n它能够帮助团队更好地协作，并在不同场景中保持流畅的沟通。\n接下来，我们会进行实际演示，so you can see exactly how it works.`;

export const DEFAULT_SETTINGS: PersistedSettings = {
  script: DEFAULT_SCRIPT,
  mode: "follow",
  speed: 1,
  fontSize: 68,
  lineHeight: 1.42,
  sidePadding: 9,
  focusPosition: 50,
  focusBandHeight: FOCUS_BAND_HEIGHT_DEFAULT,
  dimStrength: 100,
  skipAheadEnabled: true,
  mirrored: false,
  activeTokenIndex: 28,
};

export function loadSettings(): PersistedSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<PersistedSettings>;
    const focusPosition = typeof parsed.focusPosition === "number"
      ? Math.min(FOCUS_POSITION_MAX, Math.max(FOCUS_POSITION_MIN, parsed.focusPosition))
      : DEFAULT_SETTINGS.focusPosition;
    const focusBandHeight = typeof parsed.focusBandHeight === "number"
      ? Math.min(FOCUS_BAND_HEIGHT_MAX, Math.max(FOCUS_BAND_HEIGHT_MIN, parsed.focusBandHeight))
      : DEFAULT_SETTINGS.focusBandHeight;
    const fontSize = typeof parsed.fontSize === "number"
      ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, parsed.fontSize))
      : DEFAULT_SETTINGS.fontSize;
    const dimStrength = typeof parsed.dimStrength === "number"
      ? Math.min(DIM_STRENGTH_MAX, Math.max(DIM_STRENGTH_MIN, parsed.dimStrength))
      : DEFAULT_SETTINGS.dimStrength;
    const lineHeight = typeof parsed.lineHeight === "number"
      ? Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, parsed.lineHeight))
      : DEFAULT_SETTINGS.lineHeight;
    const sidePadding = typeof parsed.sidePadding === "number"
      ? Math.min(SIDE_PADDING_MAX, Math.max(SIDE_PADDING_MIN, parsed.sidePadding))
      : DEFAULT_SETTINGS.sidePadding;
    const skipAheadEnabled = typeof parsed.skipAheadEnabled === "boolean"
      ? parsed.skipAheadEnabled
      : DEFAULT_SETTINGS.skipAheadEnabled;
    return { ...DEFAULT_SETTINGS, ...parsed, focusPosition, focusBandHeight, fontSize, dimStrength, lineHeight, sidePadding, skipAheadEnabled };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: PersistedSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
