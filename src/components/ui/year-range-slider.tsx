'use client';

import * as React from 'react';
import { Slider } from './slider';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface YearRangeSliderProps {
  minYear?: number;
  maxYear?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  className?: string;
}

const YearRangeSlider = React.forwardRef<HTMLDivElement, YearRangeSliderProps>(
  ({ minYear = 1980, maxYear = new Date().getFullYear(), value, onChange, className }, ref) => {
    // Calculate the step values for the slider (0-100 range)
    const yearRange = maxYear - minYear;

    // Convert actual years to slider values (0-100)
    const sliderValues = value.map(year => ((year - minYear) / yearRange) * 100) as [
      number,
      number,
    ];

    // Handler for the slider change
    const handleSliderChange = (newValues: number[]) => {
      // Convert slider values back to years
      const newYears = newValues.map(val => Math.round(minYear + (val / 100) * yearRange)) as [
        number,
        number,
      ];

      onChange(newYears);
    };

    return (
      <div ref={ref} className={cn('space-y-4', className)}>
        <div className="flex justify-between">
          <div className="font-medium">{value[0]}</div>
          <div className="font-medium">{value[1]}</div>
        </div>
        <Slider
          value={sliderValues}
          max={100}
          step={1}
          onValueChange={handleSliderChange}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <div>{minYear}</div>
          <div>{maxYear}</div>
        </div>
      </div>
    );
  }
);
YearRangeSlider.displayName = 'YearRangeSlider';

export { YearRangeSlider };
