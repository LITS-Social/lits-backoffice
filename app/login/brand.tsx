/**
 * The brand furniture for the two unauthenticated screens.
 *
 * These are the landing page's signature devices, carried over so the first thing
 * anyone sees is unmistakably LITS and not a generic SaaS login: the warm degradê,
 * the court-line texture under a radial mask, the wordmark painted with a CSS mask
 * so it takes `currentColor`, and the feTurbulence grain (`.grain`, from
 * globals.css — the other agent's file, consumed here, not copied).
 *
 * Source of truth: LitsLandingPage/src/styles/landing.css.
 */

/** The landing's `--degrade`, verbatim. Gold at the top burning down to brown-black. */
export const STAGE_GRADIENT =
  "linear-gradient(176deg,#A8966F 0%,#B45C30 34%,#9C3D20 56%,#5E2C1B 80%,#2A1A12 100%)"

/**
 * Cream. The brand's `--off`.
 *
 * The stage is dark in BOTH themes — it is a printed object, not a surface that
 * follows the console's light/dark tokens. So its foreground is a literal, and the
 * semantic `--text-*` tokens are deliberately not used inside it: in light theme
 * those resolve to near-black, which on this gradient is a beautiful way to render
 * text invisible.
 */
export const OFF = "#E2DECC"

/**
 * The LITS wordmark. `/assets/lits.svg` used as a mask, so the glyph is painted by
 * `background` and can be any colour — same trick as the landing's `.logo` and the
 * console sidebar's lockup. viewBox is 832×450, hence the aspect ratio.
 */
export function LitsWordmark({
  className,
  color = OFF,
  glow = false,
}: {
  className?: string
  color?: string
  glow?: boolean
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "block",
        aspectRatio: "832 / 450",
        background: color,
        WebkitMask: "url('/assets/lits.svg') center/contain no-repeat",
        mask: "url('/assets/lits.svg') center/contain no-repeat",
        filter: glow ? "drop-shadow(0 16px 44px rgba(0,0,0,.45))" : undefined,
      }}
    />
  )
}

/**
 * Tennis-court lines, faded out radially.
 *
 * globals.css ships a `.court-lines` that draws in `var(--text-primary)` — correct
 * on a console surface, wrong here: on the dark stage in light theme it paints
 * black-on-brown and vanishes. Same device, cream ink.
 */
export function CourtLines() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(${OFF} 1px, transparent 1px), linear-gradient(90deg, ${OFF} 1px, transparent 1px)`,
        backgroundSize: "72px 72px",
        WebkitMaskImage:
          "radial-gradient(120% 100% at 50% 38%, #000, transparent 72%)",
        maskImage:
          "radial-gradient(120% 100% at 50% 38%, #000, transparent 72%)",
        opacity: 0.13,
      }}
    />
  )
}

/** The landing hero's warm vignette, which sinks the corners and lifts the centre. */
export function StageVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        background:
          "radial-gradient(ellipse at 50% 55%, rgba(181,74,41,.18), rgba(20,12,8,.55) 78%)",
      }}
    />
  )
}
