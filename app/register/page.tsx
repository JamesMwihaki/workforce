import { redirect } from 'next/navigation';

// Worker opt-in lives on the home page now. Twilio's toll-free review (30491)
// rejected the submission when reviewers landed on a homepage with a "log in"
// CTA and assumed the site was gated; the opt-in form is the homepage so
// reviewers see consent immediately. Keep this redirect so links shared in the
// SMS policy and older messages still work.
export default function RegisterRedirect() {
  redirect('/');
}
