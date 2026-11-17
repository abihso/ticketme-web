export function hasEventEnded(
  event: { startsAt: string; endsAt: string | null },
  now = Date.now(),
): boolean {
  return new Date(event.endsAt ?? event.startsAt).getTime() <= now;
}
