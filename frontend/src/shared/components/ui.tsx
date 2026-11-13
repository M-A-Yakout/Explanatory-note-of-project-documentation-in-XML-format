import React, { forwardRef, useId, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, TriangleAlert } from 'lucide-react'
import { t } from '../i18n'

export const cn = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(' '))

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
        'transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        focus,
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variant === 'primary' && 'bg-primary text-primary-fg hover:bg-primary-hover',
        variant === 'secondary' && 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
        variant === 'ghost' && 'text-fg hover:bg-surface-2',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90 dark:text-bg',
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

const inputBase = cn(
  'h-10 w-full min-w-0 rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-subtle',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
  'disabled:bg-surface-2 disabled:text-muted'
)

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, invalid ? 'border-danger' : 'border-border-strong', className)}
        {...rest}
      />
    )
  }
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, 'pr-8', invalid ? 'border-danger' : 'border-border-strong', className)}
        {...rest}
      >
        {children}
      </select>
    )
  }
)

export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function PasswordInput(props, ref) {
    const [shown, setShown] = useState(false)
    return (
      <div className="relative">
        <Input ref={ref} type={shown ? 'text' : 'password'} className="pr-10" {...props} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t('common.hidePassword') : t('common.showPassword')}
          className={cn('absolute right-1 top-1 grid size-8 place-items-center rounded text-muted hover:text-fg', focus)}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    )
  }
)

/**
 * Label + control + hint/error. Pass the control as a render function so it
 * receives the generated id and aria-describedby.
 */
export function FormField({
  label,
  required,
  hint,
  error,
  action,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  action?: React.ReactNode
  children: (p: { id: string; 'aria-describedby'?: string; invalid: boolean }) => React.ReactNode
}) {
  const id = useId()
  const descId = error || hint ? `${id}-desc` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
        {action}
      </div>
      {children({ id, 'aria-describedby': descId, invalid: !!error })}
      {error ? (
        <p id={descId} className="flex items-center gap-1.5 text-xs text-danger" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const Checkbox = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; error?: string }
>(function Checkbox({ label, error, ...rest }, ref) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
        <input
          id={id}
          ref={ref}
          type="checkbox"
          aria-invalid={!!error || undefined}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)]"
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p className="pl-6.5 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'error' | 'warning' | 'success'
  title?: string
  children?: React.ReactNode
}) {
  const Icon = { info: Info, error: AlertCircle, warning: TriangleAlert, success: CheckCircle2 }[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-md border px-3.5 py-3 text-sm',
        tone === 'info' && 'border-primary/30 bg-primary-soft text-fg',
        tone === 'error' && 'border-danger/30 bg-danger-soft text-fg',
        tone === 'warning' && 'border-warning/30 bg-warning-soft text-fg',
        tone === 'success' && 'border-success/30 bg-success-soft text-fg'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'info' && 'text-primary',
          tone === 'error' && 'text-danger',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success'
        )}
        aria-hidden
      />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
    </div>
  )
}

export function TextLink({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn('rounded font-medium text-primary underline-offset-4 hover:underline', focus, className)}
      {...rest}
    />
  )
}
