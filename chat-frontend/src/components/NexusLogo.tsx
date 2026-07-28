type NexusLogoProps = {
  className?: string;
};

export function NexusLogo({ className = 'h-10 w-10' }: NexusLogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="46" height="46" rx="10" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path
        d="M14 34V14L24 26L34 14V34"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </svg>
  );
}
