import { notFound, redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { attemptDetail } from '@/lib/db/adminAccess'
import { getS3SignedUrl } from '@/lib/s3'
import { SOURCE_LABELS } from '@/app/admin/actions'
import AnswerReview, { type AnswerRow } from './AnswerReview'

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  const { attemptId } = await params
  const detail = await attemptDetail(attemptId)
  if (!detail) notFound()

  const { attempt, answers: raw } = detail

  const answers: AnswerRow[] = await Promise.all(
    raw.map(async row => {
      let videoUrl: string | null = null
      if (row.s3_url) {
        const key = row.s3_url.split('.amazonaws.com/')[1]
        videoUrl = key ? await getS3SignedUrl(key) : row.s3_url
      }
      return {
        questionId: row.question_id,
        position: row.position,
        content: row.content,
        durationSec: row.duration_sec,
        videoUrl,
      }
    }),
  )

  return (
    <AnswerReview
      leadId={attempt.lead_id}
      leadName={attempt.lead_name}
      leadEmail={attempt.lead_email}
      sourceLabel={SOURCE_LABELS[attempt.lead_source ?? ''] ?? (attempt.lead_source || '—')}
      attemptNumber={attempt.attempt_number}
      status={attempt.status}
      totalDurationSec={attempt.total_duration_sec}
      answers={answers}
    />
  )
}
