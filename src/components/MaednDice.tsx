import { useEffect, useRef, useState } from 'react';

interface MaednDiceProps {
  value: number | null;
  rollSerial: number;
  highlighted?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onRoll?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  accentHex?: string;
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

const SIZE_CLASSES: Record<NonNullable<MaednDiceProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-12 h-12 rounded-xl',
  lg: 'w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-2xl',
};

export function MaednDice({
  value,
  rollSerial,
  highlighted = false,
  interactive = false,
  disabled = false,
  onRoll,
  size = 'md',
  accentHex,
}: MaednDiceProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [rollingFace, setRollingFace] = useState<number>(value ?? 6);
  const [landTick, setLandTick] = useState(0);
  const prevSerialRef = useRef<number>(rollSerial);

  useEffect(() => {
    if (rollSerial === 0) {
      prevSerialRef.current = 0;
      setIsRolling(false);
      return;
    }

    if (rollSerial <= prevSerialRef.current) {
      return;
    }

    prevSerialRef.current = rollSerial;
    setIsRolling(true);

    // Rapid intermediate tumbling faces before settling cleanly onto final value
    const sequence = [1, 4, 2, 5, 3, 6].filter((f) => f !== value);
    let step = 0;
    setRollingFace(sequence[0] ?? 3);

    const interval = setInterval(() => {
      step += 1;
      setRollingFace(sequence[step % sequence.length] ?? 4);
    }, 68);

    const finishTimer = setTimeout(() => {
      clearInterval(interval);
      setIsRolling(false);
      setLandTick((t) => t + 1);
    }, 410);

    return () => {
      clearInterval(interval);
      clearTimeout(finishTimer);
    };
  }, [rollSerial, value]);

  const shownValue = isRolling ? rollingFace : value;
  const pips = shownValue && PIP_LAYOUTS[shownValue] ? PIP_LAYOUTS[shownValue] : [];
  const clickable = Boolean(interactive && onRoll && !disabled);
  const pipRadius = size === 'xs' ? 10.5 : size === 'sm' ? 9.5 : 8.5;

  const isBrightFace = isRolling || highlighted || clickable;
  const isSix = !isRolling && value === 6;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onRoll : undefined}
      aria-label={value ? `Würfel zeigt ${value}` : 'Würfel'}
      style={{
        boxShadow:
          isRolling || (isSix && highlighted)
            ? `0 0 22px ${accentHex ?? 'rgba(255,255,255,0.35)'}`
            : highlighted && accentHex
              ? `0 0 14px ${accentHex}44`
              : clickable
                ? '0 0 20px rgba(255,255,255,0.2)'
                : undefined,
        borderColor:
          isBrightFace
            ? accentHex ?? 'rgba(255,255,255,0.9)'
            : value !== null && accentHex
              ? `${accentHex}55`
              : 'rgba(255,255,255,0.12)',
      }}
      className={`${SIZE_CLASSES[size]} ${
        isRolling ? 'animate-dice-tumble' : landTick > 0 ? 'animate-dice-land' : ''
      } relative flex items-center justify-center border transition-colors duration-150 select-none ${
        isBrightFace
          ? 'bg-gradient-to-b from-white to-zinc-200 text-zinc-950'
          : 'bg-gradient-to-b from-[#131318] to-[#09090C] text-zinc-100'
      } ${
        clickable
          ? 'cursor-pointer hover:scale-105 active:scale-95 ring-2 ring-white/25'
          : 'cursor-default'
      }`}
    >
      {/* Subtle 3D inner bevel */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-[1px] rounded-[inherit] ${
          isBrightFace
            ? 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-2px_3px_rgba(0,0,0,0.14)]'
            : 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),inset_0_-2px_4px_rgba(0,0,0,0.6)]'
        }`}
      />

      {pips.length === 0 ? (
        <span
          className={`font-mono-code ${
            size === 'xs' ? 'text-[10px]' : 'text-sm'
          } ${isBrightFace ? 'text-zinc-500' : 'text-zinc-600'}`}
        >
          ·
        </span>
      ) : (
        <svg viewBox="0 0 100 100" className="relative z-10 w-[82%] h-[82%]">
          {pips.map(([cx, cy], idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={pipRadius}
              fill={
                isBrightFace
                  ? shownValue === 6 && !isRolling
                    ? '#09090b'
                    : '#111115'
                  : value === 6 && accentHex
                    ? accentHex
                    : '#f4f4f5'
              }
            />
          ))}
        </svg>
      )}
    </button>
  );
}
