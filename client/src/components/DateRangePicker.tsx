import { useMemo } from "react";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PresetConfig = {
  label: string;
  range: () => DateRange;
};

const DEFAULT_PRESETS: PresetConfig[] = [
  {
    label: "Today",
    range: () => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    label: "Last 7 days",
    range: () => {
      const today = new Date();
      return { from: subDays(today, 6), to: today };
    },
  },
  {
    label: "Last 30 days",
    range: () => {
      const today = new Date();
      return { from: subDays(today, 29), to: today };
    },
  },
];

export interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  presets?: PresetConfig[];
  disableFuture?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  presets = DEFAULT_PRESETS,
  disableFuture = true,
}: DateRangePickerProps) {
  const label = useMemo(() => {
    if (value?.from) {
      if (value.to) {
        return `${format(value.from, "LLL dd, yyyy")} - ${format(
          value.to,
          "LLL dd, yyyy",
        )}`;
      }
      return format(value.from, "LLL dd, yyyy");
    }
    return "Select dates";
  }, [value]);

  const disabled = disableFuture ? { after: new Date() } : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id="date-range"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal sm:w-[260px]",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          numberOfMonths={2}
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          disabled={disabled}
        />
        <div className="border-t p-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange(preset.range())}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(undefined)}
            >
              Reset
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

DateRangePicker.displayName = "DateRangePicker";

