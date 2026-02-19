const SUBSCRIPT_DIGITS = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉'
};

function toSubscriptDigits(digits) {
  return String(digits)
    .split('')
    .map(digit => SUBSCRIPT_DIGITS[digit] || digit)
    .join('');
}

export function formatBlockLabels(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/\b([A-Za-z]+)(\d+)\b/g, (_, prefix, digits) => {
    return `${prefix}${toSubscriptDigits(digits)}`;
  });
}

export function formatBlockLabelList(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels.map(label => formatBlockLabels(label));
}
