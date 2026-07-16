export const FOCUS_POSITION_MIN = 20;
export const FOCUS_POSITION_MAX = 80;

// The reading window originally occupied roughly this fixed visual height.
// Keep the user-adjustable range centred on that familiar default.
export const FOCUS_BAND_HEIGHT_DEFAULT = 240;
export const FOCUS_BAND_HEIGHT_MIN = FOCUS_BAND_HEIGHT_DEFAULT / 2;
export const FOCUS_BAND_HEIGHT_MAX = FOCUS_BAND_HEIGHT_DEFAULT * 2;

export const FONT_SIZE_MIN = 44;
export const FONT_SIZE_MAX = 148;

export const DIM_STRENGTH_MIN = 0;
export const DIM_STRENGTH_MAX = 100;

export const LINE_HEIGHT_MIN = 0.8;
export const LINE_HEIGHT_MAX = 2.2;

// Each value applies to one side. A percentage keeps the reading width
// sensible across desktop, iPad, and phone landscape viewports.
export const SIDE_PADDING_MIN = 3;
export const SIDE_PADDING_MAX = 22;
