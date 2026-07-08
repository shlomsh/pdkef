import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const baseClasses = clsx('inline-flex', 'border rounded-sm');
const variantClass = clsx('bg-surface text-text border-border');

console.log(twMerge(baseClasses, variantClass));
