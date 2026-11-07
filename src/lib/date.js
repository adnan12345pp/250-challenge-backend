export function getCurrentCycle() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getNextCycle() {
  const now = new Date();
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = nextMonthDate.getFullYear();
  const month = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}