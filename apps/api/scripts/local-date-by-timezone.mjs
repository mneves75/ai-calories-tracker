export function getDateForTimezone(timeZone, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Não foi possível calcular data para timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function runCli() {
  const timeZone = process.argv[2];
  if (!timeZone) {
    console.error("uso: node local-date-by-timezone.mjs <IANA-timezone>");
    process.exit(2);
  }

  console.log(getDateForTimezone(timeZone));
}

if (import.meta.main) {
  runCli();
}
