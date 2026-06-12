// Backend/utils/normalize.js

/**
 * Normalizes stop names for consistent matching.
 * Handles underscore/space/case differences across bus, metro, train, auto data.
 */

export function normalizeKey(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/[\s\-]+/g, "_")   // space/hyphen → underscore
      .replace(/[^a-z0-9_]/g, "") // remove special chars
      .replace(/_+/g, "_");       // multiple underscores → one
  }
  
  export function normalizeLabel(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/[_\-]+/g, " ")    // underscore/hyphen → space
      .replace(/\s+/g, " ");      // multiple spaces → one
  }
  
  /**
   * Builds a lookup map: normalizedKey → original node key
   * So "dum_dum_park", "Dum Dum Park", "dum-dum-park" all resolve to same node.
   */
  export function buildNormalizedLookup(nodes) {
    const lookup = new Map();
  
    for (const [key, node] of Object.entries(nodes)) {
      // Index by node key itself
      lookup.set(normalizeKey(key), key);
  
      // Index by node name
      if (node.name) {
        lookup.set(normalizeKey(node.name), key);
      }
  
      // Index by all aliases
      if (Array.isArray(node.aliases)) {
        for (const alias of node.aliases) {
          lookup.set(normalizeKey(alias), key);
        }
      }
    }
  
    return lookup;
  }
  
  /**
   * Resolves a raw stop string (from bus/metro/train path)
   * to a canonical node key using the lookup map.
   * Returns original string if no match found.
   */
  export function resolveStopKey(rawStop, normalizedLookup) {
    const nk = normalizeKey(rawStop);
    return normalizedLookup.get(nk) || rawStop;
  }
  // normalize.js er sheshe add koro

export function scoreNodeMatch(node, rawQuery) {
    const q = String(rawQuery || "").toLowerCase().trim();
    if (!q || q.length < 2) return 0;
  
    const name = String(node.name || "").toLowerCase();
    const aliases = (node.aliases || []).map(a => String(a).toLowerCase());
  
    let score = 0;
  
    if (name === q) score += 120;
    else if (name.startsWith(q)) score += 90;
    else if (name.includes(q)) score += 70;
  
    for (const alias of aliases) {
      if (alias === q) score += 100;
      else if (alias.startsWith(q)) score += 75;
      else if (alias.includes(q)) score += 55;
    }
  
    const qCompact = q.replace(/[\s\-_]/g, "");
    const nameCompact = name.replace(/[\s\-_]/g, "");
    if (qCompact.length >= 2) {
      if (nameCompact === qCompact) score += 110;
      else if (nameCompact.startsWith(qCompact)) score += 85;
      else if (nameCompact.includes(qCompact)) score += 45;
    }
  
    return score;
  }