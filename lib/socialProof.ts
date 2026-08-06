/**
 * Urgency and social proof shown on the student's first screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THESE ARE PLACEHOLDERS. Swap them for real figures before a real send.
 *
 * Every name and number below is invented. They exist so the component can be
 * built and reviewed, not because anyone verified them. Students reading this
 * screen are deciding where to spend a year of fees, so the honest version of
 * this file is the one filled with numbers you can stand behind.
 *
 * Replace `ADMISSIONS_LAST_WEEK` with the real count and `RECENT_ADMITS` with
 * real first names and cities. Nothing else needs to change: the ticker and the
 * rotating card read straight from here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Shown in the top ticker. */
export const ADMISSIONS_LAST_WEEK = 214

/** Rotating proof card, one at a time, newest-sounding first. */
export interface Admit {
  name: string
  city: string
  when: string
}

export const RECENT_ADMITS: Admit[] = [
  { name: 'Manish', city: 'Indore', when: 'booked his seat yesterday' },
  { name: 'Bhavya', city: 'Jaipur', when: 'finished her counselling this morning' },
  { name: 'Abhishek', city: 'Patna', when: 'confirmed his admission 2 days ago' },
  { name: 'Muskan', city: 'Lucknow', when: 'booked her seat this week' },
  { name: 'Tanmay', city: 'Nagpur', when: 'completed his counselling yesterday' },
  { name: 'Nandini', city: 'Bhopal', when: 'confirmed her admission this week' },
  { name: 'Harshit', city: 'Ghaziabad', when: 'booked his seat 3 days ago' },
  { name: 'Kritika', city: 'Dehradun', when: 'finished her counselling yesterday' },
  { name: 'Sarthak', city: 'Ranchi', when: 'confirmed his admission this morning' },
  { name: 'Devansh', city: 'Agra', when: 'booked his seat this week' },
  { name: 'Srishti', city: 'Raipur', when: 'completed her counselling 2 days ago' },
  { name: 'Aniket', city: 'Meerut', when: 'confirmed his admission yesterday' },
  { name: 'Vanshika', city: 'Kanpur', when: 'booked her seat this week' },
  { name: 'Utkarsh', city: 'Varanasi', when: 'finished his counselling yesterday' },
  { name: 'Jhanvi', city: 'Guwahati', when: 'confirmed her admission 3 days ago' },
]

/** Ticker line. Kept here so the wording is edited in one place. */
export const TICKER_LINE =
  `Last chance to book your counselling call  ·  ${ADMISSIONS_LAST_WEEK} students took admission in the last week`
