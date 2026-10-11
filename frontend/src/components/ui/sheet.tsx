import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const Sheet = SheetPrimitive.Root;

/**
 * Panel geser. Mobile: bottom sheet (naik dari bawah). Desktop (md+): panel kanan.
 * Dibangun di atas Radix Dialog, jadi focus trap, Esc, dan aria sudah tertangani.
 */
function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col bg-card text-card-foreground shadow-pop outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
          "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[92dvh] max-md:rounded-t-3xl max-md:border-t max-md:border-border max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom",
          "md:inset-y-3 md:right-3 md:w-[calc(100%-1.5rem)] md:max-w-md lg:max-w-lg md:overflow-hidden md:rounded-3xl md:border md:border-border md:data-[state=open]:slide-in-from-right md:data-[state=closed]:slide-out-to-right",
          className,
        )}
        {...props}
      >
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
        {children}
        <SheetPrimitive.Close className="absolute top-3 right-3 flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:top-4 md:right-4 md:size-9 [&_svg]:size-4">
          <XIcon aria-hidden="true" />
          <span className="sr-only">Tutup</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-2 px-5 pt-4 pb-4 pr-14 md:px-7 md:pt-7", className)} {...props} />;
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-7", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex flex-col gap-2 border-t border-border bg-card px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-7 md:pb-6", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-[26px] leading-tight sm:text-3xl [overflow-wrap:anywhere]", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription };
