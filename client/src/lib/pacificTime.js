export function ptDateStringNow() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export function ptHourNow() {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );
}

export function greetingFor(firstName) {
  const hour = ptHourNow();
  let part = 'Evening';
  if (hour >= 0 && hour < 12) part = 'Morning';
  else if (hour >= 12 && hour < 17) part = 'Afternoon';
  return `Good ${part}, ${firstName}`;
}
