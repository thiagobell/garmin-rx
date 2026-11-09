import React from 'react';
import { REGIMEN_PALETTE } from '../utils/regimenColors';

interface RegimenColorSwatchesProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

/**
 * The regimen color picker: a 3×3 grid of the nine validated palette colors.
 * Replaces the old free-form <input type="color"> so every regimen color is
 * guaranteed to stay distinct from the chart data-series colors.
 */
export const RegimenColorSwatches: React.FC<RegimenColorSwatchesProps> = ({
  value,
  onChange,
  disabled = false,
}) => (
  <div className="grid grid-cols-3 gap-1.5 w-fit">
    {REGIMEN_PALETTE.map((swatch) => {
      const selected = value.toLowerCase() === swatch.hex.toLowerCase();
      return (
        <button
          key={swatch.hex}
          type="button"
          disabled={disabled}
          onClick={() => onChange(swatch.hex)}
          title={`${swatch.name} ${swatch.hex}`}
          aria-label={`${swatch.name} ${swatch.hex}`}
          aria-pressed={selected}
          className={`w-5 h-5 rounded-full shrink-0 transition ${
            selected
              ? 'ring-2 ring-slate-900 ring-offset-1'
              : 'hover:scale-110'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ backgroundColor: swatch.hex }}
        />
      );
    })}
  </div>
);
