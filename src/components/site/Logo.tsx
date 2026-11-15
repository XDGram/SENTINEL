export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 2.5 20 6v5.6c0 4.7-3.3 8.6-8 9.9-4.7-1.3-8-5.2-8-9.9V6l8-3.5Z" fill="currentColor" />
      <circle cx="12" cy="11.5" r="2.6" fill="#e59bd0" />
    </svg>
  );
}
