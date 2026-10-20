import { Field } from "@/components/ui/Field";

/** Six-digit authenticator code box; phones offer to paste a code from the app. */
export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Field label="6-digit code">
      <input
        className="input text-center font-mono text-lg tracking-[0.4em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
      />
    </Field>
  );
}
