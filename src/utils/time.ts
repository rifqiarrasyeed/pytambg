export function parseDurationToSeconds(duration: string): number {
  const match = duration.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}