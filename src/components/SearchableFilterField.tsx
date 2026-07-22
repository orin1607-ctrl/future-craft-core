import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * Autocomplete filter: full list on open, type to narrow (contains match).
 * Shared by Reports + Alerts — plate / internal number style filters.
 */
export function SearchableFilterField({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  triggerClassName,
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            triggerClassName,
            'flex items-center justify-between gap-2 text-right',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="flex-1 truncate">{value || placeholder}</span>
          <span className="flex items-center gap-1 shrink-0">
            {value ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="נקה"
                className="p-1 rounded-lg hover:bg-muted"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange('');
                  }
                }}
              >
                <X size={16} />
              </span>
            ) : null}
            <ChevronsUpDown size={16} className="opacity-60" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
        <Command
          dir="rtl"
          filter={(itemValue, search) => {
            if (!search.trim()) return 1;
            return itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="flex items-center justify-between"
              >
                <Check size={16} className={cn('shrink-0', !value ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 text-right font-medium">הכל</span>
              </CommandItem>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <Check size={16} className={cn('shrink-0', value === opt ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 text-right font-medium" dir="ltr">
                    {opt}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
