// src/config/constants.js

// ===== Mini preview spine configuration (SET THIS IN ONE PLACE) =====
// Maximum mini pieces shown in the small spine (when stack is taller, we show bottom half + top half with a crack).
export const MINI_SPINE_MAX_SHOWN = 6;

export const MINI_SPINE_KEEP_BOTTOM = Math.floor(MINI_SPINE_MAX_SHOWN / 2);
export const MINI_SPINE_KEEP_TOP = MINI_SPINE_MAX_SHOWN - MINI_SPINE_KEEP_BOTTOM;
