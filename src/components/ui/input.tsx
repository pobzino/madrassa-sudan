import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007229] focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
