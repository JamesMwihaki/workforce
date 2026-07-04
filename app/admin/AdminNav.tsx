'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin',            label: 'Overview' },
  { href: '/admin/incentives', label: 'Incentives' },
  { href: '/admin/managers',   label: 'Managers' },
  { href: '/admin/stores',     label: 'Stores' },
  { href: '/admin/workers',    label: 'Workers' },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((tab) => {
          const active =
            tab.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-black text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
