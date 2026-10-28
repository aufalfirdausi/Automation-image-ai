import sharp from "sharp";

export interface ImageStyle {
  name: string;
  palette: string;
  distribution: string;
  composition: string;
  rules: string;
}

// Fallback when Sheet unreachable. Mirrors "Pixel Navy" row in Bank_idea_orchestrator_image tab.
export const DEFAULT_STYLE: ImageStyle = {
  name: "Pixel Navy (built-in)",
  palette:
    "#e1b670, #b96925, #68392e, #201300, #404e21, #45944f, #77d3b2, #96bfff, #038ac2, #01515e, #001437, #503e66, #a762a9, #efa3c8, #ffffff, #000000",
  distribution: [
    "Background: #001437 solid, ~50% of canvas.",
    "Headline: #e1b670 fill, #000000 outline, #b96925 drop shadow.",
    "Body text: #ffffff on #01515e or #503e66 panels.",
    "Panels/cards: #01515e and #503e66 fill, #038ac2 border.",
    "Highlights/accents: #77d3b2, #96bfff, #efa3c8, #a762a9.",
    "Character skin/hair/clothes: #e1b670, #b96925, #68392e, #201300.",
    "Plants/props: #404e21, #45944f.",
    "Deep shadows: #000000, #201300.",
  ].join("\n"),
  composition: [
    "Cover 9:16: top 25% headline (3-5 words), middle 40% 2-3 concept cards, bottom 35% cozy workspace with kid coder at desk.",
    'Carousel 4:5: top 20% header, middle 40% text panel, bottom 40% illustration, small "n/7" bottom right.',
    "Safe margin ~64px all sides.",
    "Perspective: flat front view for text and cards. Workspace in slight 3/4 top-down like classic SNES RPG. No realistic 3D, no vanishing points.",
  ].join("\n"),
  rules: [
    "Authentic 16-bit retro arcade pixel art, crisp square pixels, hard edges.",
    "No gradients, glow, blur, anti-aliasing.",
    "Typography: chunky arcade bitmap font, headline ALL CAPS with black outline, body in readable pixel font.",
    "Recurring character: kid coder, brown hair, orange hoodie.",
  ].join("\n"),
};

const HEX_RE = /#[0-9a-f]{6}\b/gi;
// Words that make image models draw a palette sidebar ("pink elephant"). Lines containing them never reach the image prompt.
const TRIGGER_RE = /swatch|palette|hex|color code|colour code/i;
const SAFE_TAIL =
  "Single full-bleed illustration filling the whole canvas edge-to-edge. No sidebars, no borders, no strips along edges, no sample boxes, no watermark, no handle.";

// In-memory cache for active style (10 minute TTL)
let cachedStyle: { style: ImageStyle; expiresAt: number } | null = null;

export async function fetchActiveStyle(url = process.env.GOOGLE_SHEET_WEBHOOK_URL): Promise<ImageStyle> {
  if (!url) return DEFAULT_STYLE;

  // Return non-expired cached style immediately
  if (cachedStyle && Date.now() < cachedStyle.expiresAt) {
    return cachedStyle.style;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    const json = (await res.json()) as { status?: string; style?: Partial<ImageStyle> };
    const s = json.style;
    if (json.status !== "success" || !s || parsePalette(String(s.palette ?? "")).length !== 16) {
      return cachedStyle ? cachedStyle.style : DEFAULT_STYLE;
    }
    const resolved: ImageStyle = {
      name: String(s.name ?? "Sheet style"),
      palette: String(s.palette),
      distribution: String(s.distribution ?? ""),
      composition: String(s.composition ?? ""),
      rules: String(s.rules ?? ""),
    };

    // Cache valid response for 10 minutes
    cachedStyle = { style: resolved, expiresAt: Date.now() + 10 * 60 * 1000 };
    return resolved;
  } catch (err) {
    console.warn("[StyleFetch] Failed to fetch active style from Google Sheet. Using fallback:", err instanceof Error ? err.message : String(err));
    return cachedStyle ? cachedStyle.style : DEFAULT_STYLE;
  }
}

export function parsePalette(text: string): [number, number, number][] {
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (const hex of text.match(HEX_RE) ?? []) {
    const h = hex.toLowerCase();
    if (seen.has(h)) continue;
    seen.add(h);
    out.push([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  }
  return out;
}

// Plain-language color name from hex, so image prompts never contain hex text.
export function colorName(hex: string): string {
  const [r, g, b] = parsePalette(hex)[0] ?? [0, 0, 0];
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (l > 0.95) return "white";
  if (l < 0.04) return "black";
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l > 0.6 ? "light gray" : l > 0.3 ? "gray" : "charcoal";
  let h = 0;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  if (max === rn) h = ((gn - bn) / d + 6) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  const hues: [number, string][] = [
    [15, "red"], [40, "orange"], [55, "gold"], [75, "olive"], [150, "green"], [175, "mint"],
    [195, "teal"], [215, "cyan blue"], [245, "blue"], [285, "purple"], [330, "magenta"], [360, "red"],
  ];
  let hue = hues.find(([limit]) => h < limit)![1];
  if ((hue === "orange" || hue === "gold" || hue === "red") && l < 0.3) hue = "brown";
  if (hue === "magenta" && l > 0.7) hue = "pink";
  if (hue === "blue" && l < 0.2) hue = "navy";
  const tone = l < 0.15 ? "very dark " : l < 0.3 ? "dark " : l > 0.8 ? "pale " : l > 0.65 ? "light " : "";
  return `${tone}${hue}`.replace("very dark navy", "dark navy");
}

const nameHexes = (text: string) => text.replace(HEX_RE, (hex) => colorName(hex));
const safeLines = (text: string) =>
  text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z])/) // sentence-level, so one-paragraph prompts keep their scene
    .map((line) => line.trim())
    .filter((line) => line && !TRIGGER_RE.test(line))
    .map(nameHexes)
    .join("\n");

export function buildStyledPrompt(scene: string, style: ImageStyle): string {
  return [
    safeLines(scene),
    "COMPOSITION & PERSPECTIVE:",
    safeLines(style.composition),
    "STYLE RULES:",
    safeLines(style.rules),
    SAFE_TAIL,
  ].join("\n");
}

// ponytail: nearest-color snap only enforces palette, not true pixel grid. Add downscale+nearest upscale if model output looks blurry.
export async function snapToPalette(base64: string, palette: [number, number, number][]): Promise<string> {
  if (palette.length !== 16) {
    throw new Error("Image palette must contain exactly 16 unique colors");
  }

  const { data, info } = await sharp(Buffer.from(base64, "base64"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cache = new Map<number, number>();
  for (let i = 0; i < data.length; i += 3) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      let best = Infinity;
      idx = 0;
      for (let p = 0; p < palette.length; p++) {
        const dr = data[i] - palette[p][0], dg = data[i + 1] - palette[p][1], db = data[i + 2] - palette[p][2];
        const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dist < best) { best = dist; idx = p; }
      }
      cache.set(key, idx);
    }
    data[i] = palette[idx][0];
    data[i + 1] = palette[idx][1];
    data[i + 2] = palette[idx][2];
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  return png.toString("base64");
}
