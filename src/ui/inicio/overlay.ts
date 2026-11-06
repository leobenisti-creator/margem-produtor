/**
 * Dark veil over the Início photos (token --photoov / --photoovrgb). Wherever text sits, the veil is
 * at least OVERLAY_TEXT_ALPHA opaque; overlay.test.ts proves tx, mut, gold, positive and danger keep
 * 4.5:1 there even over a pure white pixel of the photo.
 */
export const OVERLAY_TEXT_ALPHA = 0.86

export const veil = (alpha: number) => `rgb(var(--photoovrgb) / ${alpha})`

/** Mobile: text spans the whole width, so the whole photo gets the text-level veil. */
export const VEIL_UNIFORM = veil(OVERLAY_TEXT_ALPHA)

/** md+: text column on the left (≤ 56% of the width), photo opens up to the right after 62%. */
export const VEIL_SIDE = `linear-gradient(90deg, ${veil(0.95)} 0%, ${veil(OVERLAY_TEXT_ALPHA)} 62%, ${veil(0.3)} 100%)`

/** Under a photo caption pill. */
export const VEIL_CAPTION = veil(OVERLAY_TEXT_ALPHA)
