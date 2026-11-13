interface MaednDiceProps {
  value: number | null;
  rollSerial: number;
  active: boolean;
  disabled?: boolean;
  onRoll?: () => void;
  size?: 'sm' | 'md';
}

const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

export function MaednDice({
  value,
  rollSerial,
  active,
  disabled = false,
  onRoll,
  size = 'md',
}: MaednDiceProps) {
  const pips = value && PIP_LAYOUTS[value] ? PIP_LAYOUTS[value] : [];
  const boxSize = size === 'sm' ? 'w-10 h-10 rounded-xl' : 'w-14 h-14 rounded-2xl';
  const pipRadius = size === 'sm' ? 8 : 8.5;

  const clickable = Boolean(onRoll && !disabled);

  return (
    <button
      key={rollSerial}
      type="button"
      disabled={!clickable}
      onClick={clickable ? onRoll : undefined}
      aria-label={value ? `Würfel zeigt ${value}` : 'Würfel'}
      className={`${boxSize} relative flex items-center justify-center transition-all animate-dice-roll ${
        active
          ? 'bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.22)]'
          : 'border border-white/15 bg-[#0A0A0D] text-white'
      } ${clickable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}`}
    >
      {pips.length === 0 ? (
        <span className="font-mono-code text-sm text-zinc-500">?</span>
      ) : (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {pips.map(([cx, cy], idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={pipRadius}
              fill={active ? '#000000' : '#ffffff'}
            />
          ))}
        </svg>
      )}
    </button>
  );
}
