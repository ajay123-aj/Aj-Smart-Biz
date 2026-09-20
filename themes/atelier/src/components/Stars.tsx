import styles from './Stars.module.css';

/**
 * A rating, as five stars.
 *
 * One component because the same row appears three times — on a card, beside
 * the average, and as the picker in the form — and three copies of a star is
 * how three stars end up different shapes.
 *
 * The stars are decorative by default: on a card the rating is already stated
 * in the markup around it, and five identical images announced one by one is
 * noise. Pass `label` where the row is the only thing carrying the number, and
 * it becomes a single readable value instead.
 */
export default function Stars({
  rating,
  max = 5,
  className,
  label,
}: {
  rating: number;
  max?: number;
  className?: string;
  label?: string;
}) {
  const filled = Math.max(0, Math.min(max, Math.round(rating)));

  return (
    <span
      className={`${styles.stars} ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: max }, (_, index) => (
        <Star key={index} filled={index < filled} />
      ))}
    </span>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? styles.on : styles.off}
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden="true"
    >
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95z" />
    </svg>
  );
}
