// Holidays: try 2025 (2026 may be empty)
const res = await fetch('https://date.nager.at/api/v3/PublicHolidays/2025/AE')
console.log('holidays 2025:', res.status, (await res.text()).length, 'B')

// Open Library books search (keyless)
const res2 = await fetch('https://openlibrary.org/search.json?q=artificial+intelligence&limit=3&fields=title,author_name,first_publish_year,average_rating', { headers: { 'User-Agent': 'NEXUS-AI/1.0' } })
const data = await res2.json() as { docs?: Array<{ title?: string; author_name?: string[]; first_publish_year?: number }> }
console.log('openlibrary:', res2.status, JSON.stringify(data.docs?.[0]).slice(0, 150))
