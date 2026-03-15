'use client';

import { createContext, useContext, InputHTMLAttributes, forwardRef } from 'react';

const RadioGroupContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: '', onValueChange: () => {} });

interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function RadioGroup({ value, onValueChange, children, className = '' }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div role="radiogroup" className={className}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

interface RadioGroupItemProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string;
}

export const RadioGroupItem = forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ value, className = '', ...props }, ref) => {
    const ctx = useContext(RadioGroupContext);
    return (
      <input
        ref={ref}
        type="radio"
        checked={ctx.value === value}
        onChange={() => ctx.onValueChange(value)}
        className={`h-4 w-4 text-[#007229] border-gray-300 focus:ring-[#007229] ${className}`}
        {...props}
      />
    );
  }
);

RadioGroupItem.displayName = 'RadioGroupItem';
