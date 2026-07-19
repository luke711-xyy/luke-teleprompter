import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./storage";

describe("visual theme persistence", () => {
  afterEach(() => localStorage.clear());

  it("restores a selected visual theme", () => {
    saveSettings({ ...DEFAULT_SETTINGS, visualTheme: "spotlight" });
    expect(loadSettings().visualTheme).toBe("spotlight");
  });

  it("falls back when an old or invalid stored theme is encountered", () => {
    localStorage.setItem("luke-teleprompter:settings:v1", JSON.stringify({ visualTheme: "unknown" }));
    expect(loadSettings().visualTheme).toBe("classic");
  });
});
