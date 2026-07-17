export function personalValue(value, label, nextLabels) {
  const compact = String(value ?? "").replaceAll(/\s+/g, "");
  const match = new RegExp(`${label}[：:]?(.*?)(?=${nextLabels.join("|")}|$)`).exec(compact);
  if (!match) return "";
  return match[1]
    .replace(/^[：:□]+/, "")
    .replace(/□+$/, "")
    .replaceAll(/[_＿]+/g, "");
}

const FOOTER_SIGNATURE_PATTERN = /(立切結書人|切結人|具結人|工讀生簽名|本人簽名|親筆簽名|簽名欄|簽名)[：:]?(.*)$/;

export function footerSignature(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = String(lines[index] ?? "").replaceAll(/\s+/g, "");
    const match = FOOTER_SIGNATURE_PATTERN.exec(line);
    if (match) {
      return {
        found: true,
        value: match[2].replace(/^[：:□]+/, "").replaceAll(/[_＿]+/g, "").trim()
      };
    }
  }
  return { found: false, value: "" };
}
