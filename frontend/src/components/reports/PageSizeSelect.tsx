import { Check, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { PAGE_SIZE_OPTIONS, type PageSize } from "../../types/report";
import { cn } from "../../lib/utils";

interface PageSizeSelectProps {
  value: PageSize;
  onChange: (value: PageSize) => void;
}

/** Pemilih jumlah data per halaman. Menu kustom (bukan <select> bawaan) agar konsisten di semua perangkat. */
export function PageSizeSelect({ value, onChange }: PageSizeSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Tampilkan</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`Jumlah data per halaman: ${value}`}
            className="h-10 gap-1.5 rounded-xl px-3 text-xs sm:h-9 md:rounded-full"
          >
            {value} data
            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-32">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <DropdownMenuItem key={size} onSelect={() => onChange(size)} className="justify-between">
              {size} data
              <Check aria-hidden="true" className={cn("size-4", size !== value && "invisible")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
