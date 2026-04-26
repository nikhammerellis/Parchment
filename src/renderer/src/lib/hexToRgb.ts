export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substr(0, 2), 16) / 255,
    parseInt(h.substr(2, 2), 16) / 255,
    parseInt(h.substr(4, 2), 16) / 255
  ];
}
