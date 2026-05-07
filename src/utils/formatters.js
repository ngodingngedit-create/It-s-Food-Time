export const formatPrice = (price) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price)
}

export const translateStatus = (status) => {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'pending') return 'Menunggu'
  if (s === 'success') return 'Berhasil'
  if (s === 'failed') return 'Gagal'
  return status
}
