// The email body, in plain JavaScript.
//
// Kept out of the TypeScript module so scripts/send-test-email.mjs can import
// the very same source. A preview that renders from its own copy is worse than
// no preview, because it stops matching the moment either side is edited.

const HELPLINE = '+91 92897 05122'
const HELPLINE_TEL = '+919289705122'


/** Everything before the first space, falling back to the whole thing. */
export function firstName(name) {
  const first = (name ?? '').trim().split(/\s+/)[0]
  if (!first || first.toLowerCase() === 'student') return 'there'
  // Names arrive from exports in every case: ANIRUDDHA, adamya, Arohi.
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function plainText(name) {
  return `Dear ${name},

Thank you for completing your counselling session with Sunstone.

We have received all your answers and shared them with our admissions team.

WHAT HAPPENS NEXT

1. A member of our admissions team will review your responses in full.
2. They will consider the programme you are interested in and the preferences
   you shared.
3. You will hear from us within 24 hours with the next steps for your admission.

NEED TO SPEAK TO SOMEONE SOONER?

Call our admissions helpline on ${HELPLINE}, or reply to this email.

Regards,
Team Sunstone
Sunstone Admissions
`
}

/**
 * Deliberately unstyled.
 *
 * No CSS at all, so it renders as the reader's own mail client intends: right
 * font, right size, dark mode without a fight, and nothing to break in Outlook.
 * The only markup is what carries meaning, plus a tel: link so the helpline
 * dials on a tap.
 */
export function html(name) {
  return `<html><body>
<p>Dear ${name},</p>

<p>Thank you for completing your counselling session with Sunstone.</p>

<p>We have received all your answers and shared them with our admissions team.</p>

<p><strong>What happens next</strong></p>

<ol>
  <li>A member of our admissions team will review your responses in full.</li>
  <li>They will consider the programme you are interested in and the preferences you shared.</li>
  <li>You will hear from us within 24 hours with the next steps for your admission.</li>
</ol>

<p><strong>Need to speak to someone sooner?</strong></p>

<p>Call our admissions helpline on <a href="tel:${HELPLINE_TEL}">${HELPLINE}</a>, or reply to this email.</p>

<p>Regards,<br>
Team Sunstone<br>
Sunstone Admissions</p>
</body></html>`
}
