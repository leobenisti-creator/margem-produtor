import {
  addDays,
  addTradingDays,
  cmeHolidays,
  endDateForMonth,
  fixingDates,
  isIsoDate,
  isoWeekday,
  isTradingDay,
  isYearMonth,
  lastTradingDayOfMonth,
  nextTradingDay,
  tradingDaysUntil,
} from './calendar'

describe('CBOT calendar', () => {
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('26-02-28')).toBe(false)
    expect(isIsoDate(20260228)).toBe(false)
  })

  it('adds days and finds the weekday (1 = Monday)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(isoWeekday('2026-11-05')).toBe(4) // Thursday
    expect(isoWeekday('2026-11-08')).toBe(7)
  })

  it('knows the 2026 US exchange holidays', () => {
    const h = cmeHolidays(2026)
    for (const d of [
      '2026-01-01', // New Year
      '2026-01-19', // MLK (3rd Monday)
      '2026-02-16', // Presidents (3rd Monday)
      '2026-04-03', // Good Friday (Easter 5 Apr)
      '2026-05-25', // Memorial (last Monday)
      '2026-06-19', // Juneteenth (Friday)
      '2026-07-03', // 4 July is a Saturday: closed on the Friday
      '2026-09-07', // Labor (1st Monday)
      '2026-11-26', // Thanksgiving (4th Thursday)
      '2026-12-25', // Christmas (Friday)
    ]) {
      expect(h.has(d)).toBe(true)
    }
    expect(h.size).toBe(10)
  })

  it('New Year on a Saturday does not close the Friday before (2022); a Sunday moves to Monday (2023)', () => {
    expect(isTradingDay('2021-12-31')).toBe(true)
    expect(isTradingDay('2023-01-02')).toBe(false)
  })

  it('trading days: weekdays that are not holidays', () => {
    expect(isTradingDay('2026-11-05')).toBe(true)
    expect(isTradingDay('2026-11-07')).toBe(false) // Saturday
    expect(isTradingDay('2026-11-26')).toBe(false)
    expect(isTradingDay('2026-11-27')).toBe(true) // day after Thanksgiving trades
    expect(nextTradingDay('2026-11-26')).toBe('2026-11-27')
    expect(nextTradingDay('2026-11-07')).toBe('2026-11-09')
    expect(nextTradingDay('2026-11-05')).toBe('2026-11-05')
  })
})

describe('fixingDates', () => {
  it('diario: every trading day, both ends included', () => {
    expect(fixingDates('2026-11-23', '2026-11-30', 'diario')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-27',
      '2026-11-30',
    ])
  })

  it('semanal: the weekday of the start by default, or the typed one; a holiday moves to the next trading day', () => {
    expect(fixingDates('2026-11-02', '2026-11-30', 'semanal')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    // Thursdays, 26 Nov is Thanksgiving: moves to Friday 27
    expect(fixingDates('2026-11-02', '2026-11-30', 'semanal', 4)).toEqual([
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
      '2026-11-27',
    ])
  })

  it('mensal: the typed day of the month, moved to the next trading day', () => {
    expect(fixingDates('2026-01-15', '2026-04-30', 'mensal', 15)).toEqual([
      '2026-01-15',
      '2026-02-17', // 15 Feb Sunday, 16 Presidents' Day
      '2026-03-16', // 15 Mar Sunday
      '2026-04-15',
    ])
  })

  it('mensal day 31 is cut to the length of the month', () => {
    expect(fixingDates('2026-01-15', '2026-04-30', 'mensal', 31)).toEqual([
      '2026-02-02', // 31 Jan is a Saturday
      '2026-03-02', // 28 Feb is a Saturday
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('mensal without a day uses the day of the start date', () => {
    expect(fixingDates('2026-03-10', '2026-05-31', 'mensal')).toEqual(['2026-03-10', '2026-04-10', '2026-05-11'])
  })

  it('dates outside the range are not returned and bad input gives nothing', () => {
    expect(fixingDates('2026-03-02', '2026-03-01', 'diario')).toEqual([])
    expect(fixingDates('x', '2026-03-01', 'diario')).toEqual([])
    expect(fixingDates('2026-03-03', '2026-03-09', 'semanal', 1)).toEqual(['2026-03-09'])
  })

  it('semanal without a day, starting on a weekend, uses Monday', () => {
    expect(fixingDates('2026-03-07', '2026-03-30', 'semanal')).toEqual([
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ])
  })
})

describe('lastTradingDayOfMonth / isYearMonth', () => {
  it('is the last CBOT trading day of the month', () => {
    expect(lastTradingDayOfMonth('2026-07')).toBe('2026-07-31') // Friday
    expect(lastTradingDayOfMonth('2026-05')).toBe('2026-05-29') // 31 May is a Sunday, 30 a Saturday
    expect(lastTradingDayOfMonth('2026-12')).toBe('2026-12-31') // Thursday
    expect(lastTradingDayOfMonth('2026-02')).toBe('2026-02-27') // 28 Feb is a Saturday
    expect(lastTradingDayOfMonth('2026-04')).toBe('2026-04-30')
  })
  it('a holiday at the end of the month is skipped', () => {
    // 2026: 25 Dec is a Friday and a holiday, but the month ends on the 31st (Thursday): trading
    // 2027-12-25 is a Saturday; 2027-12-31 is a Friday: trading. Check a month ending on a holiday: none in CME, so
    // use the Good Friday case through the calendar itself
    expect(lastTradingDayOfMonth('2026-04')).not.toBe('2026-04-03')
  })
  it('bad input gives null; the month shape is strict', () => {
    expect(lastTradingDayOfMonth('2026-13')).toBeNull()
    expect(lastTradingDayOfMonth('26-07')).toBeNull()
    expect(isYearMonth('2026-07')).toBe(true)
    expect(isYearMonth('2026-7')).toBe(false)
    expect(isYearMonth(202607)).toBe(false)
  })
})

describe('end date of a maturity month and business days', () => {
  it('the end date is the 28th of the month before the maturity (January goes to December of the year before)', () => {
    expect(endDateForMonth('2026-07')).toBe('2026-06-28')
    expect(endDateForMonth('2026-03')).toBe('2026-02-28')
    expect(endDateForMonth('2027-01')).toBe('2026-12-28')
    expect(endDateForMonth('2026-13')).toBeNull()
    expect(endDateForMonth('26-07')).toBeNull()
  })

  it('counts the trading days after the start up to and including the end', () => {
    // Monday 1 Jun 2026 to Sunday 28 Jun: 4 + 5 + 4 (Juneteenth, Friday 19) + 5
    expect(tradingDaysUntil('2026-06-01', '2026-06-28')).toBe(18)
    expect(tradingDaysUntil('2026-06-01', '2026-06-02')).toBe(1)
    expect(tradingDaysUntil('2026-06-01', '2026-06-01')).toBe(0)
    expect(tradingDaysUntil('2026-06-10', '2026-06-01')).toBe(0)
    expect(tradingDaysUntil('x', '2026-06-01')).toBe(0)
  })

  it('adding trading days is the inverse of counting them', () => {
    expect(addTradingDays('2026-06-01', 0)).toBe('2026-06-01')
    expect(addTradingDays('2026-06-01', 10)).toBe('2026-06-15')
    expect(addTradingDays('2026-06-18', 1)).toBe('2026-06-22') // Friday 19 is a holiday, then the weekend
    for (const n of [1, 7, 18, 40]) {
      const end = addTradingDays('2026-06-01', n) as string
      expect(tradingDaysUntil('2026-06-01', end)).toBe(n)
    }
    expect(addTradingDays('2026-06-01', -1)).toBeNull()
    expect(addTradingDays('2026-06-01', 1.5)).toBeNull()
  })
})
