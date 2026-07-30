import nexoraLogo from '../assets/nexora-logo.png';

type NexoraLogoProps = {
  className?: string;
};

export function NexoraLogo({ className = 'h-12 w-56' }: NexoraLogoProps) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-label="NEXORA">
      <img
        src={nexoraLogo}
        alt="NEXORA"
        className="absolute inset-0 h-full w-full object-cover object-center mix-blend-screen"
      />
    </div>
  );
}