import { INPUT_CLASS } from "@/components/home/auth-ui";
import { checkBirthDate, MINIMUM_AGE } from "@/lib/kamino/age";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Birthday = { month: string; day: string; year: string };
export const EMPTY_BIRTHDAY: Birthday = { month: "", day: "", year: "" };

/** Turns what was typed into a verdict the sign-up and age-gate screens can act on. */
export function judgeBirthday(b: Birthday): { kind: "ok"; year: number; month: number; day: number } | { kind: "young" } | { kind: "invalid"; message: string } {
  const year = Number(b.year);
  const month = Number(b.month);
  const day = Number(b.day);
  const result = checkBirthDate(year, month, day);
  if (!result.ok) return { kind: "invalid", message: "Enter your real birthday: month, day and a four-digit year." };
  if (result.age < MINIMUM_AGE) return { kind: "young" };
  return { kind: "ok", year, month, day };
}

export const YOUNG_MESSAGE = `Kamino is for people aged ${MINIMUM_AGE} and over, so we can't create an account for you. We don't keep the date you entered.`;

/** Month / day / year boxes. We only use the date to check the age; it is never saved. */
export function BirthdayFields({ value, onChange }: { value: Birthday; onChange: (next: Birthday) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-bold text-ink">Your birthday</legend>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
        <select
          aria-label="Month"
          required
          value={value.month}
          onChange={(e) => onChange({ ...value, month: e.target.value })}
          className={cn(INPUT_CLASS, "h-12 appearance-none pr-8", !value.month && "text-subtle")}
          style={{
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "16px",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237c3aed' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          }}
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label="Day"
          required
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          placeholder="Day"
          value={value.day}
          onChange={(e) => onChange({ ...value, day: e.target.value.replace(/\D/g, "") })}
          className={cn(INPUT_CLASS, "h-12")}
        />
        <input
          aria-label="Year"
          required
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="Year"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, "") })}
          className={cn(INPUT_CLASS, "h-12")}
        />
      </div>
      <small className="text-[12.5px] leading-[1.4] text-muted">
        Used once to check your age, then thrown away. It is never saved or shown.
      </small>
    </fieldset>
  );
}
