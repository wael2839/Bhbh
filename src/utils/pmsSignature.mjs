const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

/** يفصل ملف PMS إلى جسم + سطر الشرطة + توقيع */
export function splitPmsFile(text) {
  const lines = String(text || "").split(/\r?\n/);
  let dashIdx = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() === "-") {
      dashIdx = i;
      break;
    }
  }
  if (dashIdx < 0 || dashIdx >= lines.length - 1) {
    return {
      hasSignature: false,
      lines,
      dashIdx: -1,
      bodyText: text,
      signature: "",
    };
  }

  const signature = lines[lines.length - 1].trim();
  const bodyLines = lines.slice(0, -1);
  return {
    hasSignature: Boolean(signature),
    lines,
    dashIdx,
    bodyText: bodyLines.join("\n"),
    signature,
  };
}

export function replaceSignature(fullText, newSignature) {
  const { hasSignature, lines } = splitPmsFile(fullText);
  if (!hasSignature) return fullText;
  const next = [...lines.slice(0, -1), newSignature];
  return next.join("\n");
}

function mutateAt(char, salt) {
  const idx = B64_CHARS.indexOf(char);
  if (idx < 0) return char;
  const shift = (salt % (B64_CHARS.length - 1)) + 1;
  return B64_CHARS[(idx + shift) % B64_CHARS.length];
}

/**
 * يولّد 10 تواقيع بنفس طول الأصلي.
 * الأول = الأصلي، الباقي = تحويرات حتمية (نفس الطول دائماً).
 */
export function generateSignatureVariants(original, count = 10) {
  const sig = String(original || "").trim();
  if (!sig) return [];

  const variants = [sig];
  const chars = sig.split("");

  for (let v = 1; v < count; v += 1) {
    const next = [...chars];
    const slots = Math.max(3, Math.min(8, Math.floor(chars.length / 32)));
    for (let s = 0; s < slots; s += 1) {
      const pos = Math.floor(((v * 17 + s * 31) % 997) / 997 * (chars.length - 1));
      next[pos] = mutateAt(chars[pos], v * 13 + s * 7 + pos);
    }
    variants.push(next.join(""));
  }

  return variants;
}

export function isValidSignatureLength(a, b) {
  return String(a || "").length === String(b || "").length;
}
