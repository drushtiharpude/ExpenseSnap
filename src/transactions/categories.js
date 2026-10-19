export const PREDEFINED_CATEGORIES = [
  { id: 'food', label: 'Food', type: 'expense' },
  { id: 'transport', label: 'Transport', type: 'expense' },
  { id: 'housing', label: 'Housing', type: 'expense' },
  { id: 'utilities', label: 'Utilities', type: 'expense' },
  { id: 'health', label: 'Health', type: 'expense' },
  { id: 'shopping', label: 'Shopping', type: 'expense' },
  { id: 'salary', label: 'Salary', type: 'income' },
  { id: 'other', label: 'Other', type: 'both' },
]

export const TRANSACTION_CATEGORIES = PREDEFINED_CATEGORIES

export function isCategoryIdAllowedForTransaction(categoryId, transactionType, customCategories = []) {
  const predefined = PREDEFINED_CATEGORIES.find((category) => category.id === categoryId)
  if (predefined) return predefined.type === transactionType || predefined.type === 'both'
  const custom = customCategories.find((category) => category.id === categoryId)
  return custom?.type === transactionType
}

export function categoryLabel(categoryId, customCategories = []) {
  const predefined = PREDEFINED_CATEGORIES.find((category) => category.id === categoryId)
  if (predefined) return predefined.label
  const custom = customCategories.find((category) => category.id === categoryId)
  if (typeof custom?.name === 'string' && custom.name !== '') return custom.name
  return categoryId
}

export function categoriesForType(type, customCategories = []) {
  return [
    ...PREDEFINED_CATEGORIES.filter((category) => category.type === type || category.type === 'both'),
    ...customCategories
      .filter((category) => category.type === type)
      .map((category) => ({ id: category.id, label: category.name, custom: true })),
  ]
}

export function withSelectedCategory(options, selectedId, customCategories = []) {
  if (!selectedId || options.some((option) => option.id === selectedId)) return options
  return [...options, { id: selectedId, label: categoryLabel(selectedId, customCategories) }]
}

export function filterCategoryOptions(type, customCategories = [], transactions = []) {
  const options =
    type === 'all'
      ? [
          ...PREDEFINED_CATEGORIES,
          ...customCategories.map((category) => ({
            id: category.id,
            label: category.name,
            custom: true,
          })),
        ]
      : categoriesForType(type, customCategories)
  const known = new Set(options.map((option) => option.id))
  const extras = []
  for (const transaction of transactions) {
    if (type !== 'all' && transaction.type !== type) continue
    if (!known.has(transaction.categoryId) && !extras.includes(transaction.categoryId)) {
      extras.push(transaction.categoryId)
    }
  }
  return [
    ...options,
    ...extras.map((id) => ({ id, label: categoryLabel(id, customCategories) })),
  ]
}
