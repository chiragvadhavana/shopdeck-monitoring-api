function getPurchaseDateTime(timeCtaString) {
  const now = new Date();
  const lowerStr = timeCtaString.toLowerCase().trim();

  // Handle "just now" or "a few seconds ago"
  if (lowerStr.includes('just now') || lowerStr.includes('few seconds')) {
    return new Date(now.getTime() - 5000); // 5 seconds ago
  }

  // Handle "a second ago" or "X seconds ago"
  if (lowerStr.includes('second')) {
    const match = lowerStr.match(/(\d+)\s*second/);
    const seconds = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - seconds * 1000);
  }

  // Handle "a minute ago" or "X minutes ago"
  if (lowerStr.includes('minute')) {
    const match = lowerStr.match(/(\d+)\s*minute/);
    const minutes = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - minutes * 60 * 1000);
  }

  // Handle "an hour ago" or "X hours ago"
  if (lowerStr.includes('hour')) {
    const match = lowerStr.match(/(\d+)\s*hour/);
    const hours = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }

  // Handle "a day ago" or "X days ago"
  if (lowerStr.includes('day')) {
    const match = lowerStr.match(/(\d+)\s*day/);
    const days = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // Handle "a week ago" or "X weeks ago"
  if (lowerStr.includes('week')) {
    const match = lowerStr.match(/(\d+)\s*week/);
    const weeks = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  }

  // Handle "a month ago" or "X months ago"
  if (lowerStr.includes('month')) {
    const match = lowerStr.match(/(\d+)\s*month/);
    const months = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
  }

  // Handle "a year ago" or "X years ago"
  if (lowerStr.includes('year')) {
    const match = lowerStr.match(/(\d+)\s*year/);
    const years = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000);
  }

  // If no match found, return current time
  return now;
}
module.exports = {
  getPurchaseDateTime,
};


