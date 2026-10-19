const RUPEE_INPUT = /^(\d{1,15})(?:\.(\d{1,2}))?$/

export function rupeesInputToPaise(input) {
  if (typeof input !== 'string') return null
  const match = RUPEE_INPUT.exec(input.trim())
  if (!match) return null

  const rupees = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(fraction)) return null

  const paise = rupees * 100 + fraction
  if (!Number.isSafeInteger(paise) || paise < 1) return null
  return paise
}

export function paiseToRupeeInput(paise) {
  const rupees = Math.trunc(paise / 100)
  const fraction = paise % 100
  if (fraction === 0) return String(rupees)
  return `${rupees}.${String(fraction).padStart(2, '0')}`
}

export function formatInrFromPaise(paise) {
  const negative = paise < 0
  const absolute = Math.abs(paise)
  const rupees = Math.trunc(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  const grouped = new Intl.NumberFormat('en-IN').format(rupees)
  return `${negative ? '-' : ''}₹${grouped}.${fraction}`
}
