const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
}

export const supabase = {
  async get(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) throw new Error(await response.text())
    return await response.json()
  },

  async post(endpoint, data) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error(await response.text())
    return await response.json()
  },

  async patch(endpoint, query, data) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}?${query}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error(await response.text())
    return await response.json()
  },

  async delete(endpoint, query) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}?${query}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) throw new Error(await response.text())
    return true
  }
}
