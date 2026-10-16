import { validateSlug, titleFor } from "../../manage/core.mjs";
import {
  qrOptions,
  qrURL,
  colorQuality,
  SIZES,
} from "../../manage/qr-core.mjs";

export class Problem extends Error {
  constructor(status, message, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function publicOrigin(env, request) {
  const value = env.PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Problem(
      503,
      "The public link origin is not configured correctly.",
      "configuration",
    );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Problem(503, "Public links require HTTPS.", "configuration");
  return url.origin;
}
export function linkInput(body, env, request) {
  let slug, url;
  try {
    slug = validateSlug(String(body.slug || ""));
    url = new URL(String(body.destination || "").trim());
  } catch {
    throw new Problem(
      400,
      "Enter a valid lowercase short name and a full destination URL.",
      "validation",
    );
  }
  if (
    ["r", "signin", "signup", "profile", "health", "favicon-ico"].includes(slug)
  )
    throw new Problem(400, "That name is reserved.", "validation");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 4096
  )
    throw new Problem(
      400,
      "Use a full HTTP or HTTPS destination without credentials.",
      "validation",
    );
  const ownOrigins = new Set([
    new URL(request.url).origin,
    publicOrigin(env, request),
    "https://ksrtlink.github.io",
  ]);
  if (ownOrigins.has(url.origin))
    throw new Problem(
      400,
      "Use the original destination website rather than another studio link.",
      "validation",
    );
  return { slug, destination: url.href, title: titleFor(slug) };
}
export function designInput(body) {
  const title = String(body.title || "").trim();
  if (!title || title.length > 100)
    throw new Problem(
      400,
      "Give the design a title of up to 100 characters.",
      "validation",
    );
  try {
    const input = body.settings || {};
    const settings = {
      dots: input.dots,
      border: input.border,
      center: input.center,
      foreground: input.foreground,
      background: input.background,
      size: Number(input.size),
    };
    if (!SIZES.includes(settings.size)) throw new Error();
    const url = qrURL(String(body.url || ""));
    qrOptions({ ...settings, url });
    const quality = colorQuality(settings.foreground, settings.background);
    if (!quality.darkOnLight || quality.contrast < 4.5) throw new Error();
    return { title, url, settings };
  } catch {
    throw new Problem(
      400,
      "The QR design contains an invalid URL, shape, size, or color combination.",
      "validation",
    );
  }
}
export function linkRecord(row) {
  return {
    slug: row.slug,
    title: row.title,
    url: row.destination,
    shortUrl: row.short_url,
    legacy: !!row.legacy,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function designRecord(row) {
  return {
    id: row.id,
    trackedQrId: row.tracked_qr_id || null,
    title: row.title,
    url: row.url,
    settings: JSON.parse(row.settings_json),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
