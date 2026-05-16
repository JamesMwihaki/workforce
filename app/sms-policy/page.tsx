import Link from 'next/link';

export const metadata = {
  title: 'SMS Policy & Consent — ShiftAlert',
  description:
    'How ShiftAlert collects opt-in consent and uses SMS to coordinate shift coverage between Chipotle stores.',
};

export default function SmsPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-gray-900">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">SMS Policy &amp; Consent</h1>
        <p className="mt-2 text-sm text-gray-700">Last updated: 2026-05-06</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">About ShiftAlert</h2>
        <p>
          ShiftAlert is an internal workforce-sharing tool used by a cluster of
          Chipotle restaurants to coordinate same-day shift coverage. When a
          store is short-staffed, a manager posts a shift request and the
          system sends a one-time SMS to crew members at neighbouring stores
          who have <strong>opted in</strong> to receive these alerts.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">How users opt in</h2>
        <p>
          Crew members opt in by completing the registration form at{' '}
          <Link href="/register" className="font-medium underline">
            /register
          </Link>
          . The form collects the user&apos;s employee ID, full name, mobile
          phone number, home store, and roles. Before submitting, the user
          must check a consent box that reads:
        </p>
        <blockquote className="rounded-md border-l-4 border-black bg-gray-50 px-4 py-3 text-sm">
          &ldquo;I agree to receive SMS shift alerts from ShiftAlert at the
          phone number above. Message frequency varies. Message and data rates
          may apply. Reply HELP for help or STOP to unsubscribe at any time.
          See our SMS policy for details.&rdquo;
        </blockquote>
        <p>
          The Register button is disabled until this box is checked. No
          messages are sent to a phone number unless the registration form has
          been submitted with consent granted.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">What messages we send</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Shift alerts</strong> — One SMS per open shift for which
            the user&apos;s registered role and home store match the
            broadcast filters. Example: &ldquo;[ShiftAlert] Chipotle —
            Shawnee needs a Line Crew on Sat May 10 from 11:00 AM to 4:00 PM.
            Reply YES to claim this shift. Reply STOP to unsubscribe.&rdquo;
          </li>
          <li>
            <strong>Confirmations</strong> — A single reply confirming that a
            shift the user claimed has been assigned to them, or letting them
            know the shift has already been filled.
          </li>
          <li>
            <strong>Opt-out / opt-in confirmations</strong> — A single reply
            when the user texts STOP or START.
          </li>
        </ul>
        <p>
          We do not send marketing, promotional, or third-party messages. We
          do not share phone numbers with anyone outside the operating
          cluster.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">Message frequency</h2>
        <p>
          Frequency varies. A user may receive zero messages in a quiet week
          and several messages on a busy day, depending on how often
          neighbouring stores need coverage and which roles the user has
          registered for.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">Message and data rates</h2>
        <p>
          Message and data rates may apply. ShiftAlert does not charge for
          messages, but your mobile carrier may.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">Opting out</h2>
        <p>
          Users can opt out at any time by replying <strong>STOP</strong> to
          any ShiftAlert message. The system will:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Mark the user&apos;s record as inactive
            (<code className="rounded bg-gray-100 px-1 py-0.5 text-xs">workers.is_active = false</code>)
            so no further alerts are sent.
          </li>
          <li>
            Send one final confirmation: &ldquo;You&apos;re opted out and
            won&apos;t receive more shift alerts. Reply START to opt back
            in.&rdquo;
          </li>
        </ul>
        <p>
          Replying <strong>START</strong> re-enables alerts. Replying{' '}
          <strong>HELP</strong> returns a short description of the service and
          contact information.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <p>
          Phone numbers and registration details are stored only for the
          purpose of operating the shift-sharing program. We do not sell or
          share this data with third parties. Data is retained for the
          duration of the user&apos;s employment within the cluster, plus a
          short retention period for operational records, and is deleted on
          request.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Questions about this policy or about messages received? Contact the
          cluster administrator at{' '}
          <a
            href="mailto:jmsmwhk@gmail.com"
            className="font-medium underline"
          >
            jmsmwhk@gmail.com
          </a>
          .
        </p>
      </section>

      <footer className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-600">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </footer>
    </main>
  );
}
