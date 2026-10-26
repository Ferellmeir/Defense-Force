export function fmt(value, mode = 'round') {
  const number = Number(value);
  return String(mode === 'floor' ? Math.floor(number) : Math.round(number));
}
