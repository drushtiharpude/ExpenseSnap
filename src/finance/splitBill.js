const MAX_PARTICIPANTS = 100

export function splitBillPaise(amountPaise, participants) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
    return { ok: false, errors: ['Enter a bill amount greater than zero.'] }
  }
  if (!Number.isSafeInteger(participants) || participants < 1 || participants > MAX_PARTICIPANTS) {
    return {
      ok: false,
      errors: [`Enter a whole number of participants from 1 to ${MAX_PARTICIPANTS}.`],
    }
  }

  const basePaise = Math.floor(amountPaise / participants)
  const remainder = amountPaise % participants
  const shares = []
  if (remainder > 0) shares.push({ count: remainder, amountPaise: basePaise + 1 })
  const lowerCount = participants - remainder
  if (lowerCount > 0) shares.push({ count: lowerCount, amountPaise: basePaise })

  const assignedPaise = shares.reduce((total, share) => total + share.count * share.amountPaise, 0)
  return { ok: true, participants, amountPaise, shares, assignedPaise }
}
