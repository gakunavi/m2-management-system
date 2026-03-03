'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionContextValue {
  openItems: string[];
  toggle: (value: string) => void;
  type: 'single' | 'multiple';
}

const AccordionContext = React.createContext<AccordionContextValue>({
  openItems: [],
  toggle: () => {},
  type: 'single',
});

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple';
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ className, type = 'single', defaultValue, value, onValueChange, collapsible = true, children, ...props }, ref) => {
    const getInitialOpen = (): string[] => {
      if (value !== undefined) return Array.isArray(value) ? value : value ? [value] : [];
      if (defaultValue !== undefined) return Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : [];
      return [];
    };

    const [openItems, setOpenItems] = React.useState<string[]>(getInitialOpen);

    const controlled = value !== undefined;
    const currentOpen = controlled
      ? Array.isArray(value) ? value : value ? [value] : []
      : openItems;

    const toggle = React.useCallback(
      (itemValue: string) => {
        let next: string[];
        if (type === 'single') {
          if (currentOpen.includes(itemValue)) {
            next = collapsible ? [] : [itemValue];
          } else {
            next = [itemValue];
          }
        } else {
          next = currentOpen.includes(itemValue)
            ? currentOpen.filter((v) => v !== itemValue)
            : [...currentOpen, itemValue];
        }
        if (!controlled) setOpenItems(next);
        if (onValueChange) {
          onValueChange(type === 'single' ? (next[0] ?? '') : next);
        }
      },
      [type, currentOpen, collapsible, controlled, onValueChange],
    );

    return (
      <AccordionContext.Provider value={{ openItems: currentOpen, toggle, type }}>
        <div ref={ref} className={cn('space-y-1', className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  },
);
Accordion.displayName = 'Accordion';

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, children, ...props }, ref) => {
    return (
      <div ref={ref} data-accordion-item={value} className={cn('border rounded-lg', className)} {...props}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child as React.ReactElement<{ itemValue?: string }>, { itemValue: value });
        })}
      </div>
    );
  },
);
AccordionItem.displayName = 'AccordionItem';

interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  itemValue?: string;
}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, itemValue, ...props }, ref) => {
    const { openItems, toggle } = React.useContext(AccordionContext);
    const isOpen = itemValue ? openItems.includes(itemValue) : false;

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => itemValue && toggle(itemValue)}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-left transition-all hover:underline',
          '[&[aria-expanded=true]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      </button>
    );
  },
);
AccordionTrigger.displayName = 'AccordionTrigger';

interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {
  itemValue?: string;
}

const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ className, children, itemValue, ...props }, ref) => {
    const { openItems } = React.useContext(AccordionContext);
    const isOpen = itemValue ? openItems.includes(itemValue) : false;

    return (
      <div
        ref={ref}
        hidden={!isOpen}
        className={cn('px-4 pb-4 pt-0 text-sm', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
