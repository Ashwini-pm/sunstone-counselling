-- Two more events, to measure the setup wizard fix.
--
-- The logs showed people stopping in two places nobody could see the reason
-- for: they reached the camera step and never tapped the button, and they
-- granted the camera but never got past the mic check, which was hard-locked
-- behind the meter reading a signal. Neither had an event of its own, so the
-- funnel showed a drop with no cause.
--
--   camera_autostart  the page asked for the camera without waiting for a tap
--   mic_not_detected  they continued without the meter ever picking up sound
--
-- The second one is the important one: it says how many people the old
-- blocking check would have trapped on that screen forever.

alter table attempt_events drop constraint if exists attempt_events_event_check;

alter table attempt_events add constraint attempt_events_event_check
  check (event in (
    'link_opened',
    'attempt_submitted',
    'intro_viewed',
    'intro_accepted',
    'camera_requested',
    'camera_autostart',
    'camera_granted',
    'camera_denied',
    'mic_not_detected',
    'wizard_completed',
    'question_started',
    'question_heard',
    'recording_started',
    'recording_stopped',
    'upload_started',
    'upload_succeeded',
    'upload_failed',
    'closing_played'
  ));
