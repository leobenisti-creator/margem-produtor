/**
 * Trading calendar of the CBOT (CME Group grains): Monday to Friday except the US exchange holidays. Dates are ISO
 * strings (YYYY-MM-DD), always handled in UTC so the day never shifts with the time zone. Pure.
 */

export type Frequency = 'diario' | 'semanal' | 'mensal'

const DAY_MS = 86_400_000

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
export const toIso = (d: Date): string => d.toISOString().slice(0, 10)

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = toDate(v)
  return !Number.isNaN(d.getTime()) && toIso(d) === v
}

export const addDays = (iso: string, n: number): string => toIso(new Date(toDate(iso).getTime() + n * DAY_MS))

/** Day of the week, 1 = Monday ... 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const d = toDate(iso).getUTCDay()
  return d === 0 ? 7 : d
}

/** Today as ISO, in the local time zone of the user (not UTC: at night in Brazil UTC is already tomorrow). */
export function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Nth (1-based) given weekday (JS: 0 = Sunday) of a month (0-based). */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return toIso(new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7)))
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0))
  const back = (last.getUTCDay() - weekday + 7) % 7
  return toIso(new Date(Date.UTC(year, month + 1, 0 - back)))
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}

/**
 * A fixed-date holiday: on a Sunday the exchange is closed on the Monday; on a Saturday it is closed on the Friday
 * (CME did so on 3 Jul 2020 and 24 Dec 2021), except New Year's Day, which does not move back to the 31st.
 */
function fixed(year: number, month: number, day: number, moveBack = true): string | null {
  const d = new Date(Date.UTC(year, month, day))
  if (d.getUTCDay() === 6) return moveBack ? toIso(new Date(Date.UTC(year, month, day - 1))) : null
  return toIso(d.getUTCDay() === 0 ? new Date(Date.UTC(year, month, day + 1)) : d)
}

const cache = new Map<number, Set<string>>()

/** CME grain holidays of a year. */
export function cmeHolidays(year: number): Set<string> {
  const hit = cache.get(year)
  if (hit) return hit
  const out = new Set<string>()
  const add = (v: string | null) => v && out.add(v)
  add(fixed(year, 0, 1, false)) // New Year's Day
  add(nthWeekday(year, 0, 1, 3)) // Martin Luther King Jr. Day
  add(nthWeekday(year, 1, 1, 3)) // Presidents' Day
  add(toIso(new Date(easter(year).getTime() - 2 * DAY_MS))) // Good Friday
  add(lastWeekday(year, 4, 1)) // Memorial Day
  if (year >= 2022) add(fixed(year, 5, 19)) // Juneteenth
  add(fixed(year, 6, 4)) // Independence Day
  add(nthWeekday(year, 8, 1, 1)) // Labor Day
  add(nthWeekday(year, 10, 4, 4)) // Thanksgiving
  add(fixed(year, 11, 25)) // Christmas
  cache.set(year, out)
  return out
}

export function isTradingDay(iso: string): boolean {
  const wd = isoWeekday(iso)
  return wd <= 5 && !cmeHolidays(Number(iso.slice(0, 4))).has(iso)
}

/** The date itself when the exchange is open, else the next open day. */
export function nextTradingDay(iso: string): string {
  let d = iso
  for (let i = 0; i < 10 && !isTradingDay(d); i++) d = addDays(d, 1)
  return d
}

/** True for a real month written YYYY-MM. */
export const isYearMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

/** The last CBOT trading day of a month (YYYY-MM): the automatic end date of a contract maturing in that month. */
export function lastTradingDayOfMonth(ym: string): string | null {
  if (!isYearMonth(ym)) return null
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  let d = toIso(new Date(Date.UTC(y, m, 0)))
  for (let i = 0; i < 10 && !isTradingDay(d); i++) d = addDays(d, -1)
  return d
}

/**
 * The automatic end date of an operation maturing in the month `ym` (YYYY-MM): the 28th of the month BEFORE it.
 * The producer can edit it; null for an invalid month.
 */
export function endDateForMonth(ym: string): string | null {
  if (!isYearMonth(ym)) return null
  let y = Number(ym.slice(0, 4))
  let m = Number(ym.slice(5, 7)) - 1
  if (m === 0) {
    m = 12
    y -= 1
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-28`
}

/** Trading days after `from` up to and including `to` (0 when `to` is not after `from` or a date is invalid). */
export function tradingDaysUntil(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) return 0
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isTradingDay(d)) n += 1
  return n
}

/** The date `n` trading days after `from` (n = 0: `from` itself); null for an invalid date or a negative / non-integer n. */
export function addTradingDays(from: string, n: number): string | null {
  if (!isIsoDate(from) || !Number.isInteger(n) || n < 0) return null
  let d = from
  for (let left = n; left > 0; left--) {
    d = addDays(d, 1)
    while (!isTradingDay(d)) d = addDays(d, 1)
  }
  return d
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

/**
 * Fixing dates of an accumulator between `start` and `end` (both included), on CBOT trading days.
 * diario: every trading day. semanal: the weekday `day` (1 = Monday ... 5 = Friday; default: the weekday of `start`).
 * mensal: the day of the month `day` (1..31, cut to the month length; default: the day of `start`). A date on a
 * closed day moves to the next trading day. Invalid input gives [].
 */
export function fixingDates(start: string, end: string, frequency: Frequency, day?: number): string[] {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return []
  const out: string[] = []
  if (frequency === 'diario') {
    for (let d = start; d <= end; d = addDays(d, 1)) if (isTradingDay(d)) out.push(d)
    return out
  }
  if (frequency === 'semanal') {
    const wd =
      day !== undefined && day >= 1 && day <= 5 ? Math.round(day) : isoWeekday(start) <= 5 ? isoWeekday(start) : 1
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (isoWeekday(d) !== wd) continue
      const f = nextTradingDay(d)
      if (f >= start && f <= end) out.push(f)
    }
    return out
  }
  const dom = day !== undefined && day >= 1 && day <= 31 ? Math.round(day) : Number(start.slice(8, 10))
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5, 7)) - 1
  const endY = Number(end.slice(0, 4))
  const endM = Number(end.slice(5, 7)) - 1
  while (y < endY || (y === endY && m <= endM)) {
    const cand = toIso(new Date(Date.UTC(y, m, Math.min(dom, daysInMonth(y, m)))))
    const f = nextTradingDay(cand)
    if (f >= start && f <= end && !out.includes(f)) out.push(f)
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return out
}
